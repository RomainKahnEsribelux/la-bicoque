import { test } from 'node:test'
import assert from 'node:assert/strict'
import { brusselsToday, sixMonthsFrom, familyYear, dateBefore, remainingCapacity, stayHasConflict } from '../src/lib/familyRules.ts'

test('calendar month clamping, leap days and family year', () => {
  assert.equal(sixMonthsFrom('2026-08-31'), '2027-02-28')
  assert.equal(sixMonthsFrom('2027-08-31'), '2028-02-29')
  assert.equal(sixMonthsFrom('2026-10-21'), '2027-04-21')
  assert.equal(familyYear('2026-06-30'), 2025)
  assert.equal(familyYear('2026-07-01'), 2026)
  assert.equal(dateBefore('2026-11-20', 21), '2026-10-30')
})

test('business dates use Brussels across summer and winter boundaries', () => {
  assert.equal(brusselsToday(new Date('2026-07-01T22:30:00Z')), '2026-07-02')
  assert.equal(brusselsToday(new Date('2026-12-01T23:30:00Z')), '2026-12-02')
})

test('shared capacity counts only overlapping nights and exclusive stays block', () => {
  const occupied = [
    { start_date: '2026-11-01', end_date: '2026-11-04', guest_count: 20, stay_mode: 'open', guest_name: 'A' },
    { start_date: '2026-11-03', end_date: '2026-11-05', guest_count: 10, stay_mode: 'open', guest_name: 'B' },
  ]
  assert.equal(remainingCapacity('2026-11-02', occupied, 'open'), 10)
  assert.equal(remainingCapacity('2026-11-03', occupied, 'open'), 0)
  assert.equal(remainingCapacity('2026-11-04', occupied, 'open'), 20)
  assert.equal(stayHasConflict('2026-11-01', '2026-11-03', occupied, 10, 'open'), false)
  assert.equal(stayHasConflict('2026-11-01', '2026-11-04', occupied, 10, 'open'), true)
  assert.equal(stayHasConflict('2026-11-05', '2026-11-06', occupied, 30, 'exclusive'), false)
  assert.equal(stayHasConflict('2026-11-02', '2026-11-03', occupied, 1, 'exclusive'), true)
})
