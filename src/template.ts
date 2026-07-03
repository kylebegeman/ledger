export interface LedgerTemplateValues {
  readonly scalars: Readonly<Record<string, string>>;
  readonly arrays?: Readonly<Record<string, readonly string[]>>;
  readonly blocks?: Readonly<Record<string, string>>;
}

export function renderLedgerTemplate(
  template: string,
  values: LedgerTemplateValues,
): string {
  const scalarValues = values.scalars;
  const arrayValues = Object.fromEntries(
    Object.entries(values.arrays ?? {}).map(([key, items]) => [key, yamlStringArray(items)]),
  );
  const blockValues = values.blocks ?? {};
  let rendered = template;

  for (const [key, value] of Object.entries(scalarValues)) {
    rendered = rendered.replaceAll(`"{{${key}}}"`, `"${escapeYamlString(value)}"`);
    rendered = rendered.replaceAll(`{{${key}}}`, value);
  }
  for (const [key, value] of Object.entries(arrayValues)) {
    rendered = rendered.replaceAll(`{{${key}}}`, value);
    rendered = rendered.replace(`${key}: []`, `${key}:${value}`);
  }
  for (const [key, value] of Object.entries(blockValues)) {
    rendered = rendered.replaceAll(`{{${key}}}`, value);
  }

  const status = scalarValues.status;
  if (status) {
    rendered = rendered.replace('status: "draft"', `status: "${escapeYamlString(status)}"`);
    rendered = rendered.replace('status: "captured"', `status: "${escapeYamlString(status)}"`);
  }
  rendered = replaceDefaultBlock(rendered, "changedFiles", blockValues.changedFiles);

  return rendered;
}

export function yamlStringArray(values: readonly string[]): string {
  if (values.length === 0) return " []";
  return `\n${values.map((value) => `  - "${escapeYamlString(value)}"`).join("\n")}`;
}

export function escapeYamlString(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\r?\n/g, " ");
}

function replaceDefaultBlock(
  rendered: string,
  key: string,
  value: string | undefined,
): string {
  if (!value) return rendered;
  let next = rendered;
  if (key === "changedFiles" && rendered.includes("### path/to/file.ts")) {
    next = next.replace("### path/to/file.ts", value);
  }
  if (key === "changedFiles" && rendered.includes("Add changed files.")) {
    next = next.replace("Add changed files.", value);
  }
  return next;
}
