import { describe, expect, it } from "vitest";
import { buildRunmeRefactorPrompt } from "./prompt";

describe("buildRunmeRefactorPrompt", () => {
  it("includes project context, naming rules, and verification", () => {
    const prompt = buildRunmeRefactorPrompt({
      root: "/workspace/example",
      projectName: "example",
      scannedFiles: 12,
      taskCount: 0,
    });

    expect(prompt).toContain("项目根目录：/workspace/example");
    expect(prompt).toContain("```sh { name=dev-start }");
    expect(prompt).toContain("kebab-case");
    expect(prompt).toContain("runme list --json --project \"/workspace/example\"");
  });

  it("forbids invented commands, secrets, and dangerous execution", () => {
    const prompt = buildRunmeRefactorPrompt({
      root: "/workspace/example",
      projectName: "example",
      scannedFiles: 3,
      taskCount: 2,
    });

    expect(prompt).toContain("不虚构不存在的命令");
    expect(prompt).toContain("不提交密码、Token、私钥");
    expect(prompt).toContain("不执行发布、部署、数据库迁移");
    expect(prompt).toContain("不提交 Git 代码");
  });
});
