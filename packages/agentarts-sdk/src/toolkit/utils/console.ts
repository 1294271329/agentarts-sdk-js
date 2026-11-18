/**
 * CLI output layer for the AgentArts toolkit.
 *
 * Python implementation: the `echo_*` helpers in
 * `agentarts/toolkit/utils/common.py` plus `rich.console.Console`/`rich.panel`
 * used all over the toolkit. This module reproduces the behaviour without a
 * templating/formatting dependency: only ANSI SGR escape codes are used.
 *
 * - Colors are disabled automatically when `NO_COLOR` is set, when
 *   `FORCE_COLOR=0` is set, or when the output stream is not a TTY, in which
 *   case rich markup is stripped instead of rendered.
 * - `Console.print()` still understands the small subset of rich markup the
 *   ported code uses (`[bold cyan]`, `[/]`, `[link=url]`, …), so ported
 *   `console.print("[dim]…[/dim]")` calls keep working. Unknown bracket text is
 *   left untouched and `\[` escapes a literal bracket (rich `markup.escape`
 *   counterpart: `escapeMarkup`).
 */

const ANSI_PREFIX = '\u001b[';

/** ANSI SGR codes for the rich style names used by the toolkit. */
const CODES: Readonly<Record<string, string>> = {
  reset: `${ANSI_PREFIX}0m`,
  bold: `${ANSI_PREFIX}1m`,
  dim: `${ANSI_PREFIX}2m`,
  italic: `${ANSI_PREFIX}3m`,
  underline: `${ANSI_PREFIX}4m`,
  blink: `${ANSI_PREFIX}5m`,
  reverse: `${ANSI_PREFIX}7m`,
  black: `${ANSI_PREFIX}30m`,
  red: `${ANSI_PREFIX}31m`,
  green: `${ANSI_PREFIX}32m`,
  yellow: `${ANSI_PREFIX}33m`,
  blue: `${ANSI_PREFIX}34m`,
  magenta: `${ANSI_PREFIX}35m`,
  cyan: `${ANSI_PREFIX}36m`,
  white: `${ANSI_PREFIX}37m`,
};

const ANSI_PATTERN = /\u001b\[[0-9;]*m/g;

/** Number of printable characters in `text` (ANSI escape codes excluded). */
export function visibleLength(text: string): number {
  return text.replace(ANSI_PATTERN, '').length;
}

/**
 * Whether ANSI colors should be emitted for `stream`.
 *
 * Mirrors rich's environment handling: `FORCE_COLOR` (other than `0`/`false`)
 * forces colors, `NO_COLOR` disables them, otherwise a TTY is required.
 */
export function supportsColor(stream: NodeJS.WriteStream = process.stdout): boolean {
  const forceColor = process.env.FORCE_COLOR;
  if (forceColor !== undefined && forceColor !== '') {
    const normalized = forceColor.toLowerCase();
    if (normalized === '0' || normalized === 'false') {
      return false;
    }
    return true;
  }
  if (process.env.NO_COLOR !== undefined) {
    return false;
  }
  return stream.isTTY === true;
}

/**
 * Escape rich-markup special characters so text is printed verbatim.
 *
 * Python counterpart: `rich.markup.escape`.
 */
export function escapeMarkup(text: string): string {
  return String(text).replace(/\\/g, '\\\\').replace(/\[/g, '\\[');
}

interface StyledSegment {
  readonly text: string;
  readonly styles: readonly string[];
}

type StyleChange = { reset: true } | { closing: string[] } | { opening: string[] };

/** Parse the style names of a usertag; `null` when the tag is not markup. */
function styleNames(tag: string): string[] | null {
  const names = tag.trim().split(/\s+/).filter((name) => name.length > 0);
  if (names.length === 0) {
    return null;
  }
  const styles: string[] = [];
  for (const name of names) {
    if (name === 'link' || name.startsWith('link=')) {
      styles.push('underline');
      continue;
    }
    if (name === 'reset' || !(name in CODES)) {
      return null;
    }
    styles.push(name);
  }
  return styles;
}

/** Classify a markup tag, e.g. `red`, `bold blue`, `/`, `/red`. */
function parseStyleChange(raw: string): StyleChange | null {
  const tag = raw.trim();
  if (tag === '/') {
    return { reset: true };
  }
  if (tag.startsWith('/')) {
    const names = styleNames(tag.slice(1));
    return names === null ? null : { closing: names };
  }
  const names = styleNames(tag);
  return names === null ? null : { opening: names };
}

/**
 * Split text into styled segments, interpreting rich-style markup.
 *
 * Text that only looks like markup (e.g. `[INFO]`) is preserved literally.
 */
function parseMarkup(text: string): StyledSegment[] {
  const segments: StyledSegment[] = [];
  const active: string[] = [];
  let buffer = '';

  const flush = (): void => {
    if (buffer.length > 0) {
      segments.push({ text: buffer, styles: [...active] });
      buffer = '';
    }
  };

  let index = 0;
  while (index < text.length) {
    const char = text[index];
    if (char === '\\' && (text[index + 1] === '[' || text[index + 1] === '\\')) {
      buffer += text[index + 1];
      index += 2;
      continue;
    }
    if (char === '[') {
      const close = text.indexOf(']', index + 1);
      if (close !== -1) {
        const change = parseStyleChange(text.slice(index + 1, close));
        if (change !== null) {
          flush();
          if ('reset' in change) {
            active.length = 0;
          } else if ('closing' in change) {
            for (const name of change.closing) {
              const position = active.lastIndexOf(name);
              if (position >= 0) {
                active.splice(position, 1);
              }
            }
          } else {
            for (const name of change.opening) {
              if (!active.includes(name)) {
                active.push(name);
              }
            }
          }
          index = close + 1;
          continue;
        }
      }
      buffer += char;
      index += 1;
      continue;
    }
    buffer += char;
    index += 1;
  }

  flush();
  return segments;
}

/** The plain text of a markup string (markup tags removed). */
function plainText(text: string): string {
  return parseMarkup(text).map((segment) => segment.text).join('');
}

function segmentsText(segments: readonly StyledSegment[]): string {
  return segments.map((segment) => segment.text).join('');
}

/** Render styled segments as ANSI text, or as plain text when colors are off. */
function renderSegments(segments: readonly StyledSegment[], color: boolean): string {
  if (!color) {
    return segmentsText(segments);
  }
  let output = '';
  for (const segment of segments) {
    const codes = segment.styles
      .map((name) => CODES[name])
      .filter((code): code is string => code !== undefined)
      .join('');
    output += codes.length > 0 ? `${codes}${segment.text}${CODES.reset}` : segment.text;
  }
  return output;
}

function formatCell(cell: TableCell): string {
  if (cell === null || cell === undefined) {
    return '';
  }
  return String(cell);
}

function padded(text: string, width: number): string {
  const padding = width - visibleLength(text);
  return padding > 0 ? `${text}${' '.repeat(padding)}` : text;
}

/** Options for `Console` construction. */
export interface ConsoleOptions {
  /** Stream used for regular output (default `process.stdout`). */
  stdout?: NodeJS.WriteStream;
  /** Stream used for error output (default `process.stderr`). */
  stderr?: NodeJS.WriteStream;
  /** Force colors on/off instead of detecting them from the environment. */
  color?: boolean;
}

/** Options for `Console.printPanel`. */
export interface PanelOptions {
  /** rich border style name, e.g. `"blue"`. Defaults to no color. */
  borderStyle?: string;
}

/** A cell of a `printTable` row. */
export type TableCell = string | number | boolean | null | undefined;

/** One row of a `printTable` table. */
export type TableRow = readonly TableCell[];

/**
 * Minimal rich `Console` counterpart.
 *
 * Output goes to stdout (like Python's `Console()`), `write(…, true)` targets
 * stderr.
 */
export class Console {
  readonly stdout: NodeJS.WriteStream;
  readonly stderr: NodeJS.WriteStream;

  private readonly colorOverride: boolean | undefined;

  constructor(options: ConsoleOptions = {}) {
    this.stdout = options.stdout ?? process.stdout;
    this.stderr = options.stderr ?? process.stderr;
    this.colorOverride = options.color;
  }

  /** Whether this console emits ANSI colors. */
  get colorEnabled(): boolean {
    return this.colorOverride ?? supportsColor(this.stdout);
  }

  /** Write text without a trailing newline (no markup interpretation). */
  write(text: string, stderr = false): void {
    const stream = stderr ? this.stderr : this.stdout;
    stream.write(text);
  }

  /** Print a line to stdout, interpreting rich-style markup. */
  print(message = ''): void {
    this.write(`${renderSegments(parseMarkup(String(message)), this.colorEnabled)}\n`);
  }

  /** Print a line to stdout verbatim (markup is not interpreted). */
  printPlain(message = ''): void {
    this.write(`${message}\n`);
  }

  /** Print a line to stderr, interpreting rich-style markup. */
  printError(message = ''): void {
    this.write(`${renderSegments(parseMarkup(String(message)), this.colorEnabled)}\n`, true);
  }

  /**
   * Print a rich `Table`-style table.
   *
   * @param rows Rows in column order (`table.add_row(...)` in Python).
   * @param headers Column headers (`table.add_column(...)` in Python).
   */
  printTable(rows: readonly TableRow[], headers: readonly string[] = []): void {
    if (rows.length === 0 && headers.length === 0) {
      return;
    }
    const color = this.colorEnabled;
    const headerSegments = headers.map((header) => parseMarkup(String(header)));
    const rowSegments = rows.map((row) => row.map((cell) => parseMarkup(formatCell(cell))));
    const columnCount = Math.max(
      headers.length,
      ...rows.map((row) => row.length),
      0,
    );
    if (columnCount === 0) {
      return;
    }

    const widths: number[] = new Array<number>(columnCount).fill(0);
    headerSegments.forEach((segments, column) => {
      widths[column] = Math.max(widths[column], segmentsText(segments).length);
    });
    rowSegments.forEach((cells) => {
      cells.forEach((segments, column) => {
        widths[column] = Math.max(widths[column], segmentsText(segments).length);
      });
    });

    const renderRow = (cells: readonly StyledSegment[][], bold = false): string => {
      const rendered = widths.map((width, column) => {
        const segments = cells[column] ?? [];
        let text = renderSegments(segments, color);
        text = padded(text, width);
        if (bold && color) {
          text = `${CODES.bold}${text}${CODES.reset}`;
        }
        return ` ${text} `;
      });
      return `│${rendered.join('│')}│`;
    };

    const line = (left: string, middle: string, right: string): string =>
      `${left}${widths.map((width) => '─'.repeat(width + 2)).join(middle)}${right}`;

    const lines: string[] = [line('┌', '┬', '┐')];
    if (headerSegments.length > 0) {
      lines.push(renderRow(headerSegments, true));
      if (rowSegments.length > 0) {
        lines.push(line('├', '┼', '┤'));
      }
    }
    for (const cells of rowSegments) {
      lines.push(renderRow(cells));
    }
    lines.push(line('└', '┴', '┘'));

    this.printPlain(lines.join('\n'));
  }

  /**
   * Print a rich `Panel`-style box.
   *
   * @param title Panel title, rendered inside the top border.
   * @param content Panel body; may be multi-line.
   * @param options Border style.
   */
  printPanel(title: string, content = '', options: PanelOptions = {}): void {
    const color = this.colorEnabled;
    const borderCode = options.borderStyle ? CODES[options.borderStyle] ?? '' : '';
    const styled = (text: string): string =>
      color && borderCode.length > 0 ? `${borderCode}${text}${CODES.reset}` : text;

    const titleSegments = parseMarkup(String(title));
    const titleText = plainText(String(title));
    const contentSegments = String(content ?? '')
      .split('\n')
      .map((line) => parseMarkup(line));

    const contentWidth = contentSegments.reduce(
      (max, segments) => Math.max(max, segmentsText(segments).length),
      0,
    );
    // Interior width: content plus one space of padding on each side; a title
    // needs one more column than its text (the dash before it).
    const interior = Math.max(contentWidth, titleText.length > 0 ? titleText.length + 1 : 0, 0);

    const titlePart = titleText.length > 0 ? ` ${renderSegments(titleSegments, color)} ` : '';
    const top =
      titleText.length > 0
        ? `┌─${titlePart}${'─'.repeat(Math.max(0, interior - 1 - titleText.length))}┐`
        : `┌${'─'.repeat(interior + 2)}┐`;

    const lines: string[] = [top];
    for (const segments of contentSegments) {
      const text = renderSegments(segments, color);
      lines.push(`│ ${text}${' '.repeat(Math.max(0, interior - segmentsText(segments).length))} │`);
    }
    lines.push(`└${'─'.repeat(interior + 2)}┘`);

    this.printPlain(lines.map(styled).join('\n'));
  }
}

/** Shared `Console` used by the module-level helpers (Python `console`). */
export const console = new Console();

/**
 * Echo an error message in red with a cross mark
 * (Python `echo_error`).
 */
export function echoError(message: string): void {
  console.print(`[red]×[/red] [bold red]ERROR:[/bold red] ${message}`);
}

/**
 * Echo a success message in green with a check mark
 * (Python `echo_success`).
 */
export function echoSuccess(message: string): void {
  console.print(`[green]√[/green] [bold green]SUCCESS:[/bold green] ${message}`);
}

/**
 * Echo a warning message in yellow with a warning symbol
 * (Python `echo_warning`).
 */
export function echoWarning(message: string): void {
  console.print(`[yellow]⚠[/yellow] [bold yellow]WARNING:[/bold yellow] ${message}`);
}

/**
 * Echo an info message in a panel box (Python `echo_info`).
 *
 * @param title Title for the panel.
 * @param message Info message to display.
 */
export function echoInfo(title: string, message = ''): void {
  console.printPanel(`[bold blue]${title}[/bold blue]`, message, { borderStyle: 'blue' });
}

/**
 * Echo a step in a process (Python `echo_step`).
 *
 * @param stepNum Step number.
 * @param message Step description.
 */
export function echoStep(stepNum: number, message: string): void {
  console.print(`[bold cyan]Step ${stepNum}:[/bold cyan] ${message}`);
}

/**
 * Echo a key-value pair in formatted style (Python `echo_key_value`).
 *
 * @param key Key name.
 * @param value Value.
 * @param keyColor Color for the key.
 * @param valueColor Color for the value.
 */
export function echoKeyValue(key: string, value: string, keyColor = 'cyan', valueColor = 'white'): void {
  console.print(`  [${keyColor}]${key}:[/${keyColor}] [${valueColor}]${value}[/${valueColor}]`);
}

/** Print a table to stdout (rich `Table` counterpart). */
export function printTable(rows: readonly TableRow[], headers: readonly string[] = []): void {
  console.printTable(rows, headers);
}

/** Print a panel to stdout (rich `Panel` counterpart). */
export function printPanel(title: string, content = '', options?: PanelOptions): void {
  console.printPanel(title, content, options);
}
