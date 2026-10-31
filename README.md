# ponytail-compact

A responsive replacement for the [ponytail](https://github.com/DietrichGebert/ponytail) band above the Claude Code prompt.

- One row in compact mode, no wrapped or empty rows: the metrics text truncates instead of wrapping.
- Full button names whenever the row fits them beside 24 cells of metrics (about 58 cells on a terminal, 70 in VS Code). Narrower: short labels (`Rv` Review, `Au` Audit, `Bd` Board, `Cp` Copy, `▾`/`▴` Details/Compact). Hovering one draws its full name over the row, where the surface supports hover.
- Details mode: level buttons, then the metric columns wrapping into as many rows as the width needs.

ponytail itself stays installed and keeps updating: this mod only draws ponytail's own band state.

## Install

Requires the `ponytail` plugin. This repository is private: the machine needs a git credential for github.com first (`gh auth login`, then `gh auth setup-git`, or an SSH key).

From a shell (macOS or Windows):

```
claude plugin install ponytail-compact --marketplace tbum/ponytail-compact
```

Or at the prompt of a terminal session:

```
/plugin install ponytail-compact --marketplace tbum/ponytail-compact
```

Answer `y` to add the marketplace, then pick the user scope.

The first session after install hides ponytail's own band (`/ponytail band off`) once. `/ponytail band on` brings the original back and hides this one; `/ponytail band off` switches again.

## Update

```
claude plugin marketplace update ponytail-compact
claude plugin update ponytail-compact@ponytail-compact
```

## Notes

- Copy and the time/token formatting are copied from ponytail 5.3.3 (`hooks/band/metrics.ts`, `board.ts`, MIT). Recheck them when ponytail changes its band.
- Board opens the `board.html` ponytail rebuilt at the end of the last turn.
