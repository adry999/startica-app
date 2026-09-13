import { readdir, readFile } from 'node:fs/promises'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { PGlite } from '@electric-sql/pglite'
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto'
import { pgtap } from '@electric-sql/pglite-pgtap'

const scriptDir = dirname(fileURLToPath(import.meta.url))
const projectRoot = resolve(scriptDir, '..')
const migrationsDir = join(projectRoot, 'supabase', 'migrations')
const testsDir = join(projectRoot, 'supabase', 'tests')
const bootstrapFile = join(testsDir, 'bootstrap-pglite.sql')
const seedFile = join(projectRoot, 'supabase', 'seed.sql')
const excludedMigrations = new Set([
  '20260908000009_demo_groups_children_educators.sql',
  '20260908000013_bootstrap_kindergarten_and_roster.sql',
  '20260908000014_fix_swapped_child_names.sql',
  '20260908000016_import_expenses.sql',
])

function isSqlFile(filename) {
  return filename.endsWith('.sql')
}

async function sortedSqlFiles(directory) {
  return (await readdir(directory))
    .filter(isSqlFile)
    .sort((left, right) => left.localeCompare(right))
}

async function execFile(pg, filename) {
  try {
    return await pg.exec(await readFile(filename, 'utf8'))
  } catch (error) {
    throw new Error(`${basename(filename)}: ${error.message}`, { cause: error })
  }
}

/**
 * Creates the complete local database schema in memory. Callers own the
 * returned PGlite instance and must close it when finished.
 */
export async function createTestDatabase({ seed = true } = {}) {
  const pg = new PGlite({ extensions: { pgcrypto, pgtap } })
  try {
    await pg.exec('create extension if not exists pgcrypto; create extension if not exists pgtap;')
    await execFile(pg, bootstrapFile)

    for (const migration of await sortedSqlFiles(migrationsDir)) {
      if (excludedMigrations.has(migration)) continue
      await execFile(pg, join(migrationsDir, migration))
    }

    if (seed) await execFile(pg, seedFile)
    return pg
  } catch (error) {
    await pg.close()
    throw error
  }
}

function tapOutput(results) {
  const output = results
    .flatMap(result => result.rows ?? [])
    .flatMap(row => Object.values(row))
    .filter(value => typeof value === 'string')
    .join('\n')

  return output
}

async function runTests(filter) {
  let pg
  try {
    pg = await createTestDatabase()
    const tests = (await sortedSqlFiles(testsDir))
      .filter(filename => filename.endsWith('.test.sql'))
      .filter(filename => !filter || filename.includes(filter))

    if (tests.length === 0) throw new Error(`No SQL tests match filter: ${filter}`)

    for (const test of tests) {
      const output = tapOutput(await execFile(pg, join(testsDir, test)))
      const plans = [...output.matchAll(/^1\.\.(\d+)$/gm)]
      const assertions = [...output.matchAll(/^(?:not )?ok\s+\d+\b/gm)]
      if (plans.length !== 1 || Number(plans[0][1]) !== assertions.length
        || /^not ok\b/im.test(output) || /^Bail out!/im.test(output)) {
        throw new Error(`TAP failure in ${test}:\n${output}`)
      }
      console.log(`ok - ${test} (${assertions.length} assertions)`)
    }
  } finally {
    await pg?.close()
  }
}

function parseFilter(args) {
  const index = args.indexOf('--filter')
  if (index === -1) return undefined
  const filter = args[index + 1]
  if (!filter || filter.startsWith('--')) throw new Error('--filter requires a test filename fragment')
  return filter
}

const invokedFile = process.argv[1] && pathToFileURL(resolve(process.argv[1])).href
if (invokedFile === import.meta.url) {
  runTests(parseFilter(process.argv.slice(2))).catch((error) => {
    console.error(error instanceof Error ? error.stack ?? error.message : error)
    process.exitCode = 1
  })
}
