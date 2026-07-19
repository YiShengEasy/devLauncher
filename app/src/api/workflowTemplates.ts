import type { Action, CompletionRule, WorkflowDefinition, WorkflowFailurePolicy, WorkflowStep } from "@/types/actions";
import { workflowId } from "./workflow";

export type WorkflowTemplateCategory = "dev" | "test" | "release" | "monitor";

export interface WorkflowTemplateSummary {
  id: string;
  name: string;
  category: WorkflowTemplateCategory;
  description: string;
  stepCount: number;
}

export interface WorkflowTemplateStepDraft {
  name: string;
  action: Action;
  completion: CompletionRule;
  delayMs?: number;
  onFailure?: WorkflowFailurePolicy;
}

export interface WorkflowTemplateDefinition {
  id: string;
  name: string;
  category: WorkflowTemplateCategory;
  description: string;
  failurePolicy: WorkflowFailurePolicy;
  steps: WorkflowTemplateStepDraft[];
}

export interface WorkflowTemplatePackage {
  id: string;
  name: string;
  version: string;
  description?: string;
  templates: WorkflowTemplateDefinition[];
}

const PROJECT_DIR = "/path/to/project";
const LOCAL_BASE_URL = "http://127.0.0.1:3000";

function shellStep(name: string, content: string, completion: CompletionRule): WorkflowTemplateStepDraft {
  return {
    name,
    action: {
      type: "script",
      name,
      shell: "terminal",
      content,
    },
    completion,
  };
}

const TEMPLATES: WorkflowTemplateDefinition[] = [
  {
    id: "start-local-project",
    name: "启动本地项目",
    category: "dev",
    description: "进入项目目录，安装依赖并启动开发服务；生成后先把路径和端口改成你的项目。",
    failurePolicy: "stop",
    steps: [
      shellStep(
        "启动开发服务",
        `cd ${PROJECT_DIR} && npm install && npm run dev`,
        { type: "process_started", stabilizationMs: 1200, timeoutMs: 20_000 },
      ),
      shellStep(
        "检查本地端口",
        `curl -fsS ${LOCAL_BASE_URL}/ >/dev/null`,
        { type: "process_exit", successCodes: [0], timeoutMs: 30_000 },
      ),
    ],
  },
  {
    id: "test-and-build",
    name: "测试并构建",
    category: "test",
    description: "执行前端测试和构建，适合提交前绑定到虚拟键盘。",
    failurePolicy: "stop",
    steps: [
      shellStep(
        "运行测试",
        `cd ${PROJECT_DIR} && npm test`,
        { type: "process_exit", successCodes: [0], timeoutMs: 180_000 },
      ),
      shellStep(
        "运行构建",
        `cd ${PROJECT_DIR} && npm run build`,
        { type: "process_exit", successCodes: [0], timeoutMs: 180_000 },
      ),
    ],
  },
  {
    id: "release-preflight",
    name: "发布前检查",
    category: "release",
    description: "检查工作区、测试、构建和基础安全扫描入口，适合发布前跑一遍。",
    failurePolicy: "stop",
    steps: [
      shellStep(
        "查看 Git 状态",
        `cd ${PROJECT_DIR} && git status --short`,
        { type: "process_exit", successCodes: [0], timeoutMs: 20_000 },
      ),
      shellStep(
        "运行测试",
        `cd ${PROJECT_DIR} && npm test`,
        { type: "process_exit", successCodes: [0], timeoutMs: 180_000 },
      ),
      shellStep(
        "运行构建",
        `cd ${PROJECT_DIR} && npm run build`,
        { type: "process_exit", successCodes: [0], timeoutMs: 180_000 },
      ),
      shellStep(
        "可选 Trivy 扫描",
        `cd ${PROJECT_DIR} && command -v trivy >/dev/null && trivy fs --scanners vuln,secret . || echo "trivy 未安装，跳过扫描"`,
        { type: "process_exit", successCodes: [0], timeoutMs: 300_000 },
      ),
    ],
  },
  {
    id: "api-smoke-test",
    name: "API Smoke 测试",
    category: "test",
    description: "用 curl 检查健康接口，后续可替换成 Newman、Bruno CLI 或 Hurl。",
    failurePolicy: "stop",
    steps: [
      shellStep(
        "检查健康接口",
        `curl -fsS ${LOCAL_BASE_URL}/health`,
        { type: "process_exit", successCodes: [0], timeoutMs: 30_000 },
      ),
    ],
  },
  {
    id: "local-service-monitor",
    name: "本地服务监控",
    category: "monitor",
    description: "检查本地服务 URL，失败时停止；适合作为监控/巡检工作流的起点。",
    failurePolicy: "stop",
    steps: [
      shellStep(
        "检查服务首页",
        `curl -fsS ${LOCAL_BASE_URL}/ >/dev/null`,
        { type: "process_exit", successCodes: [0], timeoutMs: 20_000 },
      ),
      shellStep(
        "检查健康接口",
        `curl -fsS ${LOCAL_BASE_URL}/health >/dev/null`,
        { type: "process_exit", successCodes: [0], timeoutMs: 20_000 },
      ),
    ],
  },
];

export const BUILTIN_WORKFLOW_TEMPLATE_PACKAGE: WorkflowTemplatePackage = {
  id: "devlauncher.workflow-pack.devops-core",
  name: "DevOps Core Workflows",
  version: "1.0.0",
  description: "开发、测试、发布前检查和本地服务监控工作流模板。",
  templates: TEMPLATES,
};

export const WORKFLOW_TEMPLATE_CATEGORY_LABELS: Record<WorkflowTemplateCategory, string> = {
  dev: "开发",
  test: "测试",
  release: "发布",
  monitor: "监控",
};

export function listWorkflowTemplates(): WorkflowTemplateSummary[] {
  return TEMPLATES.map((template) => ({
    id: template.id,
    name: template.name,
    category: template.category,
    description: template.description,
    stepCount: template.steps.length,
  }));
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, entry]) => entry !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, stableValue(entry)]),
    );
  }
  return value;
}

function valuesMatch(left: unknown, right: unknown): boolean {
  return JSON.stringify(stableValue(left)) === JSON.stringify(stableValue(right));
}

export function matchingOfficialTemplateId(workflow: WorkflowDefinition): string | undefined {
  return TEMPLATES.find((template) => (
    workflow.name === template.name
    && workflow.description === template.description
    && workflow.enabled
    && workflow.failurePolicy === template.failurePolicy
    && workflow.steps.length === template.steps.length
    && workflow.steps.every((step, index) => {
      const templateStep = template.steps[index];
      return Boolean(
        templateStep
        && step.name === templateStep.name
        && step.enabled
        && step.condition.type === "always"
        && step.delayMs === (templateStep.delayMs ?? 0)
        && step.onFailure === templateStep.onFailure
        && valuesMatch(step.action, templateStep.action)
        && valuesMatch(step.completion, templateStep.completion)
      );
    })
  ))?.id;
}

export function createWorkflowFromTemplateDefinition(template: WorkflowTemplateDefinition): WorkflowDefinition {
  if (!template.steps.length) throw new Error(`workflow template has no steps: ${template.id}`);
  const now = new Date().toISOString();
  return {
    id: workflowId("workflow"),
    name: template.name,
    description: template.description,
    enabled: true,
    failurePolicy: template.failurePolicy,
    steps: template.steps.map<WorkflowStep>((step) => ({
      id: workflowId("step"),
      name: step.name,
      enabled: true,
      action: { ...step.action },
      condition: { type: "always" },
      completion: { ...step.completion },
      delayMs: step.delayMs ?? 0,
      onFailure: step.onFailure,
    })),
    createdAt: now,
    updatedAt: now,
  };
}

export function createWorkflowFromTemplate(templateId: string): WorkflowDefinition {
  const template = TEMPLATES.find((item) => item.id === templateId);
  if (!template) throw new Error(`unknown workflow template: ${templateId}`);
  return createWorkflowFromTemplateDefinition(template);
}

export function createWorkflowsFromTemplatePackage(pkg: WorkflowTemplatePackage): WorkflowDefinition[] {
  if (!pkg.templates.length) throw new Error("模板包没有可导入的工作流。");
  return pkg.templates.map(createWorkflowFromTemplateDefinition);
}
