import test from 'node:test'
import assert from 'node:assert/strict'
import { legacySiteRedirect } from '../lib/auth/site-redirect.ts'
import { authRedirectUrl } from '../lib/auth/urls.ts'

const old = 'https://unimetrocamp.vercel.app'
const siteUrl = 'https://uniconecta-crm.vercel.app'
const options = { enabled: true, siteUrl }

test('legacy navigation preserves route and query on the configured domain', () => {
  assert.equal(legacySiteRedirect(new URL(`${old}/high-school/escolas?status=agendada`), 'GET', options)?.href,
    `${siteUrl}/high-school/escolas?status=agendada`)
  assert.equal(legacySiteRedirect(new URL(old), 'HEAD', options)?.href, `${siteUrl}/`)
})

test('migration is inactive until explicitly enabled', () => {
  assert.equal(legacySiteRedirect(new URL(old), 'GET', { ...options, enabled: false }), null)
  assert.equal(legacySiteRedirect(new URL(old), 'GET', { enabled: true, siteUrl: undefined }), null)
})

test('existing auth links and API calls stay on their original origin', () => {
  for (const path of ['/auth', '/auth/callback?code=example', '/auth/reset-password', '/auth/login', '/api/cron/calendar-invites', '/_next/static/example.js']) {
    assert.equal(legacySiteRedirect(new URL(old + path), 'GET', options), null, path)
  }
  assert.equal(legacySiteRedirect(new URL(old), 'POST', options), null)
})

test('new domain and preview URLs never redirect', () => {
  for (const origin of [siteUrl, 'https://preview.example.com', 'http://localhost:3000']) {
    assert.equal(legacySiteRedirect(new URL(origin), 'GET', options), null)
  }
})

test('invalid destinations and loops leave the legacy site working', () => {
  for (const invalid of ['', 'invalid', 'http://uniconecta-crm.vercel.app', old, `${siteUrl}/login`, `${siteUrl}?x=1`, `${siteUrl}#x`, 'https://user:pass@example.com']) {
    assert.equal(legacySiteRedirect(new URL(old), 'GET', { ...options, siteUrl: invalid }), null, invalid)
  }
})

test('password recovery callback follows the origin where the user requested it', () => {
  for (const origin of [old, siteUrl]) {
    const callback = new URL(authRedirectUrl(origin, '/auth/reset-password'))
    assert.equal(callback.origin, origin)
    assert.equal(callback.pathname, '/auth/callback')
    assert.equal(callback.searchParams.get('next'), '/auth/reset-password')
  }
})
