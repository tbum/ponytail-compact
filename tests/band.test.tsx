import { expect, test } from 'claude-code/testing'

const BAND = {
  level: 'full',
  model: '',
  cost: 1.5,
  spent: 1.5,
  turns: 3,
  turnCosts: [0.5, 0.4, 0.6],
  tokens: { input: 1000, output: 2000, cacheRead: 0, cacheWrite: 0 },
  busyMs: 90000,
  name: 'task',
  project: 'apps',
  session: 's1',
  transcript: '',
  reused: ['a', 'b'],
  created: ['c'],
  removed: [],
  openCallers: [],
  tests: { state: 'pass' as const, passed: 12 },
  details: false,
}

const site = (bodyColumns: number) =>
  ({
    plugin: 'ponytail-compact',
    component: 'AbovePrompt',
    props: { hasSurvey: false, isWorking: false, maxRows: 20, bodyColumns, scroll: { offset: 0, bodyRows: 20 }, view: {} },
  }) as const

const engine = (on: Parameters<Parameters<typeof test>[1]>[1], flag: string) => {
  on('env.get', (_, e) => ({ value: e.name === 'HOME' ? '/home/me' : undefined }))
  on('fs.read', (_, e) => (e.path.endsWith('/.ponytail-band') ? { value: flag } : { value: '' }))
  // ponytail's band as ponytail wrote it; this mod's own state goes to the kit's store beneath.
  on('state.get', (_, e, next) => (e.plugin === 'ponytail' ? { value: { value: BAND, version: 1 } } : next(e)))
  on('store.set', () => ({ value: undefined }))
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>engine</Text>
  })
}

// Columns either side of where full names start to fit: a terminal needs about 58, a graphical surface about 40.
const WIDTHS = { terminal: [50, 60], desktop: [30, 58], vscode: [30, 58] } as const

test('narrow: short labels, wide: full labels, on every band surface', async ($, on) => {
  engine(on, 'off')
  for (const surface of ['terminal', 'desktop', 'vscode'] as const) {
    const [narrowColumns, wideColumns] = WIDTHS[surface]
    const narrow = await $.ui.mount({ ...site(narrowColumns), surface })
    expect((await narrow.find({ key: 'review' }))?.text).toBe('Rv')
    expect((await narrow.find({ type: 'Text', text: /\$1\.50/ }))?.text).toContain('✓ 12 tests')
    await narrow.unmount()

    // 58: the width VS Code reported for a chat panel with plenty of room (2026-10-31).
    const wide = await $.ui.mount({ ...site(wideColumns), surface })
    expect((await wide.find({ key: 'review' }))?.text).toBe('Review')
    await wide.unmount()
  }
})

test('details opens the level row and the columns', async ($, on) => {
  engine(on, 'off')
  const ui = await $.ui.mount({ ...site(40), surface: 'vscode' })
  await ui.press({ key: 'details' })
  expect(await ui.find({ key: 'level-ultra' })).toBeDefined()
  expect((await ui.find({ key: 'copy' }))?.text).toBe('Cp')
  await ui.unmount()
})

test("ponytail's own band showing: this one stays out", async ($, on) => {
  engine(on, 'on')
  const ui = await $.ui.mount({ ...site(60), surface: 'terminal' })
  expect(await ui.find({ key: 'review' })).toBeUndefined()
  await ui.unmount()
})
