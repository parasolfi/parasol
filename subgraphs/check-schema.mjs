#!/usr/bin/env node
// Proves the standardized schema instead of asserting it: every venue must
// carry the common surface byte-for-byte. Drift here is silent otherwise —
// a venue renames a field, consumers written against the standard break on
// that venue only, and nothing fails until someone queries it.
//
// Run: node subgraphs/check-schema.mjs

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = new URL('.', import.meta.url).pathname
const MARKER = '# ─── venue-specific plumbing'

function commonSurface(path) {
  const text = readFileSync(path, 'utf8')
  const cut = text.indexOf(MARKER)
  if (cut === -1) throw new Error(`${path} has no "venue-specific plumbing" marker`)
  return text.slice(0, cut)
}

const expected = commonSurface(join(ROOT, 'common/schema.graphql'))

const venues = readdirSync(ROOT).filter((entry) => {
  if (entry === 'common' || entry.startsWith('.')) return false
  try {
    return statSync(join(ROOT, entry, 'schema.graphql')).isFile()
  } catch {
    return false
  }
})

if (venues.length === 0) {
  console.error('no venue schemas found')
  process.exit(1)
}

let failed = false
for (const venue of venues) {
  const path = join(ROOT, venue, 'schema.graphql')
  try {
    if (commonSurface(path) === expected) {
      console.log(`  ok      ${venue}`)
    } else {
      console.error(`  DRIFTED ${venue} — common surface differs from common/schema.graphql`)
      failed = true
    }
  } catch (error) {
    console.error(`  BROKEN  ${venue} — ${error.message}`)
    failed = true
  }
}

console.log(`\n${venues.length} venue(s) checked against the common surface`)
process.exit(failed ? 1 : 0)
