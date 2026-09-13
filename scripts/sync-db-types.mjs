// Regenerate the API additions from the migrated local catalog, preserving
// unrelated generated fields that also exist in the hosted schema.
import { readFile, writeFile } from 'node:fs/promises'
import { createTestDatabase } from './test-db.mjs'

const file = new URL('../src/core/supabase/types.ts', import.meta.url)
const db = await createTestDatabase({ seed: false })
try {
  let source = await readFile(file, 'utf8')
  const { rows: keys } = await db.query(`
    select c.conname, array_agg(a.attname order by k.ord) as columns,
      array_agg(b.attname order by k.ord) as targets
    from pg_constraint c
    cross join lateral unnest(c.conkey,c.confkey) with ordinality as k(local_col,foreign_col,ord)
    join pg_attribute a on a.attrelid=c.conrelid and a.attnum=k.local_col
    join pg_attribute b on b.attrelid=c.confrelid and b.attnum=k.foreign_col
    where c.conname in ('attendance_child_id_fkey','attendance_group_id_fkey',
      'invoices_child_id_fkey','payments_invoice_id_fkey')
    group by c.conname
  `)
  for (const key of keys) {
    const pattern = new RegExp(`(foreignKeyName: "${key.conname}"\\s+columns: )\\[[^\\]]*\\]([\\s\\S]*?referencedColumns: )\\[[^\\]]*\\]`)
    if (!pattern.test(source)) throw new Error(`Missing relationship ${key.conname}`)
    source = source.replace(pattern, (_match, start, middle) =>
      `${start}${JSON.stringify(key.columns)}${middle}${JSON.stringify(key.targets)}`)
  }
  const { rows: functions } = await db.query(`
    select proname, proargnames,
      coalesce(proargmodes, array['i']::"char"[]) as modes,
      coalesce(proallargtypes, proargtypes::oid[])::regtype[]::text as types,
      prorettype::regtype::text as result_type
    from pg_proc where proname in ('invoice_summary','invoice_total_paid','payment_summary') order by proname
  `)
  const typeMap = { uuid: 'string', numeric: 'number', bigint: 'number' }
  for (const fn of functions) {
    const types = fn.types.slice(fn.types.indexOf('{') + 1, -1).split(',').map(type => {
      if (!typeMap[type]) throw new Error(`Unsupported SQL type ${type}`)
      return typeMap[type]
    })
    const args = fn.proargnames.flatMap((name, index) => fn.modes[index] === 'i' ? [`${name}: ${types[index]}`] : [])
    const outputs = fn.proargnames.flatMap((name, index) => fn.modes[index] === 't' ? [`          ${name}: ${types[index]}`] : [])
    const result = outputs.length ? `{\n${outputs.join('\n')}\n        }[]` : typeMap[fn.result_type]
    if (!result) throw new Error(`Unsupported return type ${fn.result_type}`)
    const block = `      ${fn.proname}: {\n        Args: { ${args.join('; ')} }\n        Returns: ${result}\n      }\n`
    const previous = new RegExp(`^      ${fn.proname}: \\{[\\s\\S]*?^      \\}\\r?\\n`, 'm')
    source = previous.test(source)
      ? source.replace(previous, block)
      : source.replace('      user_kindergarten_ids:', `${block}      user_kindergarten_ids:`)
  }
  if (process.argv.includes('--check')) {
    if (source.replaceAll('\r\n', '\n') !== (await readFile(file, 'utf8')).replaceAll('\r\n', '\n')) {
      throw new Error('Database API types are stale; run npm run db:types:sync')
    }
  } else {
    await writeFile(file, source)
  }
  console.log('Database aggregate and relationship types match the migrated schema.')
} finally {
  await db.close()
}
