import { atom, read, update } from 'claude-code'
import type { EngineInterface, PluginState, Register } from 'claude-code'

// ponytail's own band state: ponytail's hooks keep writing it, this mod only draws it.
type Band = PluginState['ponytail']['band']
const PONYTAIL_BAND = { plugin: 'ponytail', key: 'band' } as const

const details = atom({ plugin: 'ponytail-compact', key: 'details' } as const, false)

const LEVELS = ['off', 'lite', 'full', 'ultra']
// Full button names whenever they fit beside this much of the metrics text.
const MIN_METRICS = 24
// shortcut: a graphical surface draws a Button wider than its label's cells; a guessed padding, raise it if full names still wrap there.
const BUTTON_PAD = 3

// Windows sets USERPROFILE, not HOME.
const home = async ($: EngineInterface) => (await $.env.get('HOME')) ?? (await $.env.get('USERPROFILE'))
const claudeDir = async ($: EngineInterface) => (await $.env.get('CLAUDE_CONFIG_DIR')) ?? `${await home($)}/.claude`

// Drawn only while `/ponytail band off` hides ponytail's own band, so `/ponytail band on` brings the original back.
async function ponytailBandHidden($: EngineInterface): Promise<boolean> {
  try {
    return (await $.fs.read(`${await claudeDir($)}/.ponytail-band`)).trim() === 'off'
  } catch {
    return false
  }
}

// --- Copied from ponytail 5.3.3 hooks/band (board.ts, metrics.ts) so "Copy" stays identical; recheck on a ponytail update.
const duration = (minutes: number) => (minutes < 60 ? `${minutes}m` : `${Math.floor(minutes / 60)}h ${minutes % 60}m`)
const elapsed = (ms: number) => {
  const s = Math.round(ms / 1000)
  if (s < 60) return `${s}s`
  if (s < 3600) return `${Math.floor(s / 60)}m ${s % 60}s`
  return duration(Math.round(s / 60))
}
const fmtTokens = (n: number) => (n < 1000 ? `${n}` : n < 1e6 ? `${+(n / 1e3).toFixed(1)}k` : `${+(n / 1e6).toFixed(1)}M`)
const totalTokens = (t: Band['tokens']) => t.input + t.output + t.cacheRead + t.cacheWrite
const percent = (reused: number, created: number) => (reused + created < 3 ? undefined : Math.round((reused / (reused + created)) * 100))
const testsLabel = (t: Band['tests']) =>
  t.state === 'pass' ? `${t.passed ?? ''} passed`.trim() : t.state === 'fail' ? `${t.failed ?? ''} failed`.trim() : t.state === 'stale' ? 'stale' : 'not run'
const stamp = (ms: number) => {
  const d = new Date(ms)
  const two = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())} ${two(d.getHours())}:${two(d.getMinutes())}`
}
const per = (total: number, n: number) => (n > 0 ? total / n : 0)

function markdown(b: Band, startedAt: number): string {
  const t = b.tokens
  const cost = +b.spent.toFixed(4)
  const lastTurn = b.turnCosts[b.turnCosts.length - 1] ?? null
  const reuse = percent(b.reused.length, b.created.length) ?? null
  const rows = [
    ['Project', b.project],
    ['Started', stamp(startedAt)],
    ['Model', b.model || '–'],
    ['Cost', `$${cost.toFixed(2)}${lastTurn === null ? '' : ` · last turn $${lastTurn.toFixed(2)}`} · ⌀ $${per(cost, b.turns).toFixed(2)} / turn`],
    ['Turns', `${b.turns}`],
    ['Agent time', `${elapsed(b.busyMs)} · ⌀ ${elapsed(per(b.busyMs, b.turns))} / turn`],
    ['Tokens', `${fmtTokens(totalTokens(t))} (input ${fmtTokens(t.input)}, output ${fmtTokens(t.output)}, cache read ${fmtTokens(t.cacheRead)}, cache write ${fmtTokens(t.cacheWrite)})`],
    ['Reuse', `${reuse === null ? '–' : `${reuse}%`} (${b.reused.length} used, ${b.created.length} new)`],
    ['Callers open', `${b.openCallers.length}`],
    ['Tests', testsLabel(b.tests)],
    ['ponytail level', b.level],
    ['Session', `\`${b.session}\``],
  ]
  const cell = (v: string) => v.replace(/\|/g, '\\|')
  return [`## ${cell(b.name || 'Untitled session')}`, '', '| | |', '|---|---|', ...rows.map(([k, v]) => `| ${k} | ${cell(v ?? '')} |`)].join('\n')
}
// --- end of copy

// ponytail rebuilds board.html after every turn; this opens that file rather than rebuilding it.
// shortcut: shows the board as of the last turn's end; ponytail's own button rebuilds it first.
async function openBoard($: EngineInterface) {
  const file = `${(await $.env.get('XDG_CONFIG_HOME')) ?? `${await home($)}/.config`}/ponytail/band/board.html`
  if (!(await $.fs.exists(file))) throw new Error(`no board yet: ${file}`)
  const windows = (await $.env.get('OS')) === 'Windows_NT'
  const mac = !windows && (await $.process.run(['uname'])).stdout.trim() === 'Darwin'
  await $.process.run(windows ? ['cmd', '/c', 'start', '', file] : [mac ? 'open' : 'xdg-open', file])
}

// The same commands a person types, so ponytail's skills stay the only logic.
const run = ($: EngineInterface, command: string, args = '') => $.command.run({ command, args })

type Action = { key: string; label: string; short: string; hint: string; press: () => unknown }

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    // The first start on a machine hides ponytail's band in favour of this one, so an install is one line.
    // Once only: a later `/ponytail band on` stays on.
    if ((await $.store.get('tookOver')) !== true) {
      await $.fs.write(`${await claudeDir($)}/.ponytail-band`, 'off')
      await $.store.set('tookOver', true)
    }
    const stored = await $.store.get('details')
    if (stored === true) await update($, details, () => true)
    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey || !(await ponytailBandHidden($))) return next(e)
    const { value: b } = await $.state.get(PONYTAIL_BAND)
    // Nothing recorded yet: ponytail has not set the session up.
    if (b === undefined) return next(e)
    // Other mods share this slot: draw theirs below ours.
    const below = await next(e).catch(() => undefined)

    const isOpen = await read($, details)
    const reuse = percent(b.reused.length, b.created.length)
    const last = b.turnCosts[b.turnCosts.length - 1]
    const avg = b.turns > 0 ? b.spent / b.turns : 0
    const hasOpen = b.openCallers.length > 0

    const toggle = async () => {
      const open = !isOpen
      await update($, details, () => open)
      await $.store.set('details', open)
    }
    const copy = async () => {
      const startedAt = (await $.session.usage()).startedAt
      const done = await $.ui.copy({ text: markdown(b, startedAt), surface: e.surface })
      $.ui.toast(done.isCopied ? 'Task copied as Markdown' : `Copy failed: ${done.reason}`)
    }

    const actions: Action[] = [
      ...(isOpen ? [{ key: 'copy', label: 'Copy', short: 'Cp', hint: 'Copy · 이 작업 지표를 Markdown 으로 복사', press: copy }] : []),
      { key: 'review', label: 'Review', short: 'Rv', hint: 'Review · 지금 변경을 리뷰 (/ponytail-review)', press: () => run($, 'ponytail:ponytail-review') },
      { key: 'audit', label: 'Audit', short: 'Au', hint: 'Audit · 저장소 전체 점검 (/ponytail-audit)', press: () => run($, 'ponytail:ponytail-audit') },
      { key: 'board', label: 'Board', short: 'Bd', hint: 'Board · 작업 보드를 브라우저로 열기', press: () => openBoard($).catch(err => $.ui.toast(`ponytail-compact: ${String(err)}`)) },
      isOpen
        ? { key: 'details', label: 'Compact', short: '▴', hint: 'Compact · 한 줄로 접기', press: toggle }
        : { key: 'details', label: 'Details', short: '▾', hint: 'Details · 레벨 · 상세 지표 펼치기', press: toggle },
    ]
    // Cells the row needs with full names: what leads it, room for the metrics (compact only), then the buttons.
    const pad = e.surface === 'terminal' ? 0 : BUTTON_PAD
    const cells = (labels: string[]) => labels.reduce((n, label) => n + label.length + pad + 1, 0)
    const lead = isOpen ? cells(LEVELS) : `● ${b.level}`.length + 1 + MIN_METRICS
    const narrow = e.props.bodyColumns < lead + cells(actions.map(a => a.label))

    const { Box, Text, Button } = $.ui.resolve(e)

    // Narrow: short labels, and the hovered button's full name drawn over the row's text (a band has no room above it for a card).
    const buttons = (
      <Box flexDirection="row" flexShrink={0} columnGap={1}>
        {actions.map(a => (
          <Box key={`ptc-${a.key}`} hover={{ scope: `ptc-${a.key}` }}>
            <Button key={a.key} plain label={narrow ? a.short : a.label} onPress={a.press} />
          </Box>
        ))}
      </Box>
    )
    const withHints = (content: ReturnType<typeof Text>) => (
      <Box flexDirection="row" flexGrow={1} flexShrink={1} minWidth={0} overflow="hidden">
        {content}
        {narrow &&
          actions.map(a => (
            <Box key={`ptc-hint-${a.key}`} position="absolute" top={0} left={0} display="none" hover={{ display: 'flex', scope: `ptc-${a.key}` }}>
              <Text inverse wrap="truncate-end">{` ${a.hint} `}</Text>
            </Box>
          ))}
      </Box>
    )
    const stack = (mine: ReturnType<typeof Box>) => (below ? <Box flexDirection="column">{mine}{below}</Box> : mine)

    if (!isOpen) {
      const testsText =
        b.tests.state === 'pass' ? `✓ ${b.tests.passed ?? ''} tests` : b.tests.state === 'fail' ? `✗ ${b.tests.failed ?? ''} failed` : b.tests.state === 'stale' ? 'no test since change' : ''
      // Most telling first: a truncated row loses its tail.
      return stack(
        <Box flexDirection="row" alignItems="center" columnGap={1}>
          <Button key="level" plain onPress={toggle}>
            <Text color={b.level === 'off' ? 'inactive' : 'suggestion'}>●</Text> {b.level}
          </Button>
          {withHints(
            <Text wrap="truncate-end">
              <Text>${b.spent.toFixed(2)}</Text>
              {hasOpen && <Text color="warning"> · ⚠ {b.openCallers.length} callers</Text>}
              {testsText !== '' && (
                <Text color={b.tests.state === 'pass' ? 'success' : b.tests.state === 'fail' ? 'error' : undefined} dimColor={b.tests.state === 'stale'}>
                  {' · '}
                  {testsText}
                </Text>
              )}
              <Text dimColor> · {elapsed(b.busyMs)}</Text>
              {reuse !== undefined && <Text> · {reuse}% reuse</Text>}
              {last !== undefined && <Text dimColor> · last ${last.toFixed(2)}</Text>}
            </Text>
          )}
          {buttons}
        </Box>
      )
    }

    // Only columns that say something, as ponytail's own band; they wrap into as many rows as the width needs.
    type Col = { key: string; label: string; value: string; sub: string; tone?: 'warning' | 'success' | 'error' }
    const cols: Col[] = [
      { key: 'cost', label: 'cost', value: `$${b.spent.toFixed(2)}`, sub: last === undefined ? '' : `last $${last.toFixed(2)} · ⌀ $${avg.toFixed(2)}` },
      { key: 'tokens', label: 'tokens', value: fmtTokens(totalTokens(b.tokens)), sub: `${b.turns} ${b.turns === 1 ? 'turn' : 'turns'}` },
      { key: 'time', label: 'agent time', value: elapsed(b.busyMs), sub: b.turns > 0 ? `⌀ ${elapsed(b.busyMs / b.turns)} / turn` : '' },
    ]
    if (reuse !== undefined) cols.push({ key: 'reuse', label: 'reuse', value: `${reuse}%`, sub: '' })
    if (hasOpen) cols.push({ key: 'callers', label: 'callers', value: `${b.openCallers.length} open`, sub: b.openCallers.slice(0, 2).join(', '), tone: 'warning' })
    if (b.tests.state !== 'none') {
      cols.push({
        key: 'tests',
        label: 'tests',
        value: testsLabel(b.tests),
        sub: b.tests.state === 'pass' ? 'after last change' : b.tests.state === 'fail' ? 'last run' : 'code changed since',
        tone: b.tests.state === 'pass' ? 'success' : b.tests.state === 'fail' ? 'error' : undefined,
      })
    }

    return stack(
      <Box flexDirection="column">
        <Box flexDirection="row" alignItems="center" columnGap={1}>
          {LEVELS.map(level => (
            <Button
              key={`level-${level}`}
              label={level}
              {...(level === b.level ? { variant: 'primary' as const } : { plain: true as const, dimColor: true })}
              onPress={() => run($, 'ponytail:ponytail', level)}
            />
          ))}
          {withHints(<Text> </Text>)}
          {buttons}
        </Box>
        <Box flexDirection="row" flexWrap="wrap" columnGap={2}>
          {cols.map(c => (
            <Box key={`col-${c.key}`} flexDirection="column" flexGrow={1} minWidth={16}>
              <Text wrap="truncate-end">
                <Text dimColor>{c.label} </Text>
                <Text bold color={c.tone}>
                  {c.value}
                </Text>
              </Text>
              {c.sub !== '' && (
                <Text dimColor wrap="truncate-end">
                  {c.sub}
                </Text>
              )}
            </Box>
          ))}
        </Box>
      </Box>
    )
  })
}
