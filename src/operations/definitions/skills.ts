import { z } from "zod";
import { installLedgerSkill, skillHosts, type InstallSkillResult, type LedgerSkillHost } from "../../skills.js";
import { looseRecord, requireWorkspace } from "../shared.js";
import { defineOperation } from "../types.js";

const hostChoices = [...skillHosts, "all"] as const;

interface SkillsInstallInput extends Record<string, unknown> {
  readonly hosts?: readonly (LedgerSkillHost | "all")[];
}

export const skillsInstallOperation = defineOperation<SkillsInstallInput, InstallSkillResult>({
  name: "skills.install",
  title: "Install the Ledger skill",
  description: "Write the Ledger SKILL.md under .agents/skills/ledger and expose it to agent hosts.",
  workspace: "required",
  mutates: true,
  input: z.strictObject({
    hosts: z.array(z.enum(hostChoices)).optional().describe("Hosts to expose the skill to. Defaults to all."),
  }),
  output: looseRecord({
    path: z.string(),
    changed: z.boolean(),
    hosts: z.array(looseRecord({ host: z.string(), path: z.string(), mode: z.string(), changed: z.boolean() })),
  }),
  cli: {
    path: ["skills", "install"],
    usage: "ledger skills install [--host <claude-code|codex|cursor|all>] [--json]",
    flags: {
      host: {
        type: "string[]",
        field: "hosts",
        description: "Host to expose the skill to (repeatable).",
        choices: [...hostChoices],
        choicesLabel: "skill host",
      },
    },
    json: true,
    help: `Writes .agents/skills/ledger/SKILL.md, the Agent Skills entry that tells any
skills-aware agent when to call packet, explain, search, session note, new,
promote, and ready. Codex and Cursor read .agents/skills natively; Claude Code
gets a symlink at .claude/skills/ledger, or a copy where symlinks are not
available. Re-running refreshes the skill in place.`,
  },
  async run(context, input) {
    const workspace = requireWorkspace(context);
    const requested = input.hosts ?? ["all"];
    const hosts = requested.includes("all")
      ? [...skillHosts]
      : [...new Set(requested.filter((host): host is LedgerSkillHost => host !== "all"))];
    const result = await installLedgerSkill(workspace, { hosts });
    return { data: result };
  },
  format(data) {
    const lines = [data.changed ? `Wrote ${data.path}` : `${data.path} is current`];
    for (const host of data.hosts) {
      const state = host.mode === "native" ? "reads .agents/skills natively" : `${host.mode} at ${host.path}${host.changed ? "" : " (current)"}`;
      lines.push(`- ${host.host}: ${state}`);
    }
    return lines.join("\n");
  },
});
