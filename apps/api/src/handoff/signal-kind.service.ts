import { Injectable } from "@nestjs/common";
import {
  type CreateTaskInput,
  type HandoffSignalKind,
  type HandoffSignalKindInput,
  SUBSYSTEMS,
  type TaskTarget,
} from "@zibby/contracts";
import { TaskSchedulerService } from "../tasks/task-scheduler.service";
import { HandoffSignalKindStore } from "./handoff-signal-kind.store";

/** `createSignalKind`'s response — the freshly registered kind plus its build-task id. */
export interface CreateSignalKindResult {
  signalKind: HandoffSignalKind;
  buildTaskId: string;
}

/**
 * B1 — a thin service wrapping {@link HandoffSignalKindStore} that owns the
 * ZIBBY-native build-task spawn (design doc
 * `docs/superpowers/specs/2026-07-22-handoff-signal-registry-and-receiver-filter-design.md`,
 * Slot B → B1/B3): registering a new signal kind also creates a Forge task to
 * implement its emit, via the SAME `TaskSchedulerService.createTask(...)` call
 * `HandoffService.dispatchTask` already uses — `TaskSchedulerService` is
 * already reachable here because `HandoffModule` imports `TasksModule` for
 * `HandoffService`'s own dispatch path, so no new module edge (and no DI
 * cycle) is introduced.
 */
@Injectable()
export class SignalKindService {
  constructor(
    private readonly store: HandoffSignalKindStore,
    private readonly taskScheduler: TaskSchedulerService,
  ) {}

  list(): Promise<HandoffSignalKind[]> {
    return this.store.list();
  }

  /**
   * Register the kind (store mints its id, forces `pending`/`system:false`),
   * then spawn a Forge-targeted build task describing what to implement and
   * link it back onto the stored row via `markBuildTask`.
   */
  async create(input: HandoffSignalKindInput): Promise<CreateSignalKindResult> {
    const signalKind = await this.store.create(input);
    const taskInput: CreateTaskInput = {
      title: `Implementuj producenta signálu "${signalKind.id}"`,
      text: buildTaskText(signalKind),
      paths: [],
    };
    const result = await this.taskScheduler.createTask(
      taskInput,
      Date.now(),
      undefined,
      forgeTarget(),
    );
    const buildTaskId = result.task.id;
    await this.store.markBuildTask(signalKind.id, buildTaskId);
    return { signalKind: { ...signalKind, buildTaskId }, buildTaskId };
  }

  update(id: string, input: HandoffSignalKindInput): Promise<HandoffSignalKind> {
    return this.store.update(id, input);
  }

  delete(id: string): Promise<void> {
    return this.store.delete(id);
  }
}

/** Resolve Forge's display name off the subsystem registry — same lookup `HandoffService.decorateTarget` uses. */
function forgeTarget(): TaskTarget {
  const name = SUBSYSTEMS.find((s) => s.id === "forge")?.name ?? "forge";
  return { kind: "subsystem", id: "forge", name };
}

/** The build task's Czech instruction body — mirrors the design doc's Slot B3 template. */
function buildTaskText(sk: HandoffSignalKind): string {
  const severityHint = sk.severityBearing ? `, severity: <low|moderate|high|critical>` : "";
  return [
    `Subsystém **${sk.from}** má nově emitovat handoff signál \`${sk.id}\`.`,
    `Kdy se spustí / popis: ${sk.description}`,
    "",
    `Implementuj to tak, že v producentské službě subsystému ${sk.from} po detekci zavoláš`,
    `\`HandoffService.evaluate({ from: "${sk.from}", kind: "${sk.id}"${severityHint}, ... })\`.`,
    "",
    `Signál je zaregistrovaný jako "pending" a sám se přepne na "active", jakmile emit poprvé proběhne.`,
  ].join("\n");
}
