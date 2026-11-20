export type TokenKind =
  | "plain"
  | "keyword"
  | "string"
  | "comment"
  | "number"
  | "fn";

export interface CodeToken {
  kind: TokenKind;
  text: string;
}

const KEYWORDS = new Set([
  "async", "await", "break", "case", "catch", "class", "const", "continue",
  "def", "default", "del", "elif", "else", "enum", "except", "export",
  "extends", "false", "False", "finally", "fn", "for", "from", "func",
  "function", "if", "impl", "import", "in", "is", "lambda", "let", "match",
  "mut", "new", "nil", "None", "nonlocal", "not", "null", "or", "package",
  "pass", "private", "protected", "pub", "public", "raise", "readonly",
  "return", "self", "static", "struct", "super", "switch", "this", "throw",
  "true", "True", "try", "type", "typeof", "undefined", "use", "var",
  "void", "while", "with", "yield"
]);

const TOKEN_PATTERN =
  /(\/\/.*$|#.*$|\/\*[\s\S]*?\*\/|`(?:\\.|[^`\\])*`|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|\b\d+(?:\.\d+)?\b|\b[A-Za-z_][A-Za-z0-9_]*\b(?=\s*\()|\b[A-Za-z_][A-Za-z0-9_]*\b)/gm;

export function tokenizeLine(line: string): CodeToken[] {
  if (!line) return [{ kind: "plain", text: "" }];

  const tokens: CodeToken[] = [];
  let cursor = 0;

  TOKEN_PATTERN.lastIndex = 0;
  let match: RegExpExecArray | null = TOKEN_PATTERN.exec(line);

  while (match !== null) {
    const start = match.index;
    const raw = match[0];

    if (start > cursor) {
      tokens.push({ kind: "plain", text: line.slice(cursor, start) });
    }

    let kind: TokenKind = "plain";
    if (raw.startsWith("//") || raw.startsWith("#") || raw.startsWith("/*")) {
      kind = "comment";
    } else if (raw.startsWith('"') || raw.startsWith("'") || raw.startsWith("`")) {
      kind = "string";
    } else if (/^\d/.test(raw)) {
      kind = "number";
    } else if (KEYWORDS.has(raw)) {
      kind = "keyword";
    } else {
      const nextChar = line.slice(start + raw.length).trimStart()[0];
      if (nextChar === "(") {
        kind = "fn";
      }
    }

    tokens.push({ kind, text: raw });
    cursor = start + raw.length;
    match = TOKEN_PATTERN.exec(line);
  }

  if (cursor < line.length) {
    tokens.push({ kind: "plain", text: line.slice(cursor) });
  }

  return tokens;
}
