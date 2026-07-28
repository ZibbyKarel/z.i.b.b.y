import type { HandoffSignalKind } from "@zibby/contracts";
import { DropdownTestId } from "@zibby/design-system";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { toastBus } from "../../../components/Toaster/toastBus";
import { renderWithProviders as render, screen, waitFor, within } from "../../../test/render";
import { SignalCreateForm, SignalCreateFormTestId, previewSlug } from "./SignalCreateForm";

const push = vi.fn();
const back = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, back }) }));

const { hooks } = vi.hoisted(() => ({
  hooks: {
    subsystems: { data: [] as { id: string; name: string }[] },
    createMutation: {
      mutate: vi.fn(),
      isPending: false,
      isError: false,
    },
    updateMutation: {
      mutate: vi.fn(),
      isPending: false,
      isError: false,
    },
  },
}));

vi.mock("../../subsystems/queries", () => ({
  useSubsystemsQuery: () => hooks.subsystems,
}));
vi.mock("../../handoff/mutations", () => ({
  useCreateSignalKindMutation: () => hooks.createMutation,
  useUpdateSignalKindMutation: () => hooks.updateMutation,
}));

const SENTINEL = { id: "sentinel", name: "Sentinel" };
const LOOM = { id: "loom", name: "Loom" };

describe("SignalCreateForm (B3b)", () => {
  beforeEach(() => {
    push.mockClear();
    back.mockClear();
    hooks.subsystems = { data: [SENTINEL, LOOM] };
    hooks.createMutation = { mutate: vi.fn(), isPending: false, isError: false };
    hooks.updateMutation = { mutate: vi.fn(), isPending: false, isError: false };
  });

  it("renders every field", () => {
    render(<SignalCreateForm />);
    expect(screen.getByTestId(SignalCreateFormTestId.Root)).toBeInTheDocument();
    expect(screen.getByTestId(SignalCreateFormTestId.Producer)).toBeInTheDocument();
    expect(screen.getByTestId(SignalCreateFormTestId.Label)).toBeInTheDocument();
    expect(screen.getByTestId(SignalCreateFormTestId.Description)).toBeInTheDocument();
    expect(screen.getByTestId(SignalCreateFormTestId.SeverityBearing)).toBeInTheDocument();
    expect(screen.getByTestId(SignalCreateFormTestId.SlugPreview)).toBeInTheDocument();
    expect(screen.getByTestId(SignalCreateFormTestId.Submit)).toBeInTheDocument();
    expect(screen.getByTestId(SignalCreateFormTestId.Cancel)).toBeInTheDocument();
  });

  it("prefills the producer from defaultFrom", () => {
    render(<SignalCreateForm defaultFrom="loom" />);
    const wrapper = screen.getByTestId(SignalCreateFormTestId.Producer);
    expect(within(wrapper).getByTestId(DropdownTestId.Trigger)).toHaveTextContent("Loom");
  });

  it("updates the slug preview as the label changes", async () => {
    render(<SignalCreateForm />);
    const labelInput = screen.getByPlaceholderText("např. Prošlý certifikát");
    await userEvent.type(labelInput, "Prošlý Certifikát!");
    expect(screen.getByTestId(SignalCreateFormTestId.SlugPreview)).toHaveTextContent(
      previewSlug("Prošlý Certifikát!"),
    );
  });

  it("previewSlug approximates the server's uniqueSlug", () => {
    expect(previewSlug("Prošlý Certifikát!")).toBe("pro-l-certifik-t");
    expect(previewSlug("  ")).toBe("signal");
  });

  it("required-field validation blocks submit until label/description are filled", async () => {
    render(<SignalCreateForm defaultFrom="sentinel" />);
    expect(screen.getByTestId(SignalCreateFormTestId.Submit)).toBeDisabled();

    await userEvent.type(screen.getByPlaceholderText("např. Prošlý certifikát"), "Cert expired");
    expect(screen.getByTestId(SignalCreateFormTestId.Submit)).toBeDisabled();

    await userEvent.type(
      screen.getByPlaceholderText("Popište, kdy tento signál nastane…"),
      "Fires when a TLS cert is about to expire.",
    );
    expect(screen.getByTestId(SignalCreateFormTestId.Submit)).toBeEnabled();
  });

  it("submitting valid values calls the mutation with the exact body and navigates on success", async () => {
    const emitSpy = vi.spyOn(toastBus, "emit");
    hooks.createMutation.mutate = vi.fn((_vars, opts) => {
      opts?.onSuccess?.({ status: 201, body: { buildTaskId: "task_1" } });
    });
    render(<SignalCreateForm defaultFrom="sentinel" />);

    await userEvent.type(screen.getByPlaceholderText("např. Prošlý certifikát"), "Cert expired");
    await userEvent.type(
      screen.getByPlaceholderText("Popište, kdy tento signál nastane…"),
      "Fires when a TLS cert is about to expire.",
    );
    await userEvent.click(screen.getByTestId(SignalCreateFormTestId.Submit));

    // `handleSubmit` validates asynchronously (zodResolver), so the mutation is
    // called a tick or more AFTER the click promise settles — asserting straight
    // after `click` is a race that only loses under load (it did, on CI, with
    // "Number of calls: 0" while passing every local run).
    await waitFor(() =>
      expect(hooks.createMutation.mutate).toHaveBeenCalledWith(
        {
          body: {
            from: "sentinel",
            label: "Cert expired",
            description: "Fires when a TLS cert is about to expire.",
            severityBearing: false,
          },
        },
        expect.objectContaining({ onSuccess: expect.any(Function) }),
      ),
    );
    expect(push).toHaveBeenCalledWith("/signals");
    expect(emitSpy).toHaveBeenCalledWith(
      expect.objectContaining({ severity: "ok", message: expect.stringContaining("task_1") }),
    );
  });

  it("Cancel navigates back", async () => {
    render(<SignalCreateForm />);
    await userEvent.click(screen.getByTestId(SignalCreateFormTestId.Cancel));
    expect(back).toHaveBeenCalled();
  });
});

describe("SignalCreateForm — edit mode (B3c)", () => {
  const CUSTOM_THING: HandoffSignalKind = {
    id: "custom-thing",
    from: "loom",
    label: "Custom Thing",
    description: "an operator-registered signal",
    severityBearing: false,
    status: "pending",
    system: false,
  };

  beforeEach(() => {
    push.mockClear();
    back.mockClear();
    hooks.subsystems = { data: [SENTINEL, LOOM] };
    hooks.createMutation = { mutate: vi.fn(), isPending: false, isError: false };
    hooks.updateMutation = { mutate: vi.fn(), isPending: false, isError: false };
  });

  it("prefills every field from initial and shows the fixed id instead of a slug preview", () => {
    render(<SignalCreateForm initial={CUSTOM_THING} />);

    const producerWrapper = screen.getByTestId(SignalCreateFormTestId.Producer);
    expect(within(producerWrapper).getByTestId(DropdownTestId.Trigger)).toHaveTextContent("Loom");
    expect(screen.getByDisplayValue("Custom Thing")).toBeInTheDocument();
    expect(screen.getByDisplayValue("an operator-registered signal")).toBeInTheDocument();
    expect(screen.getByTestId(SignalCreateFormTestId.SlugPreview)).toHaveTextContent(
      "custom-thing",
    );
  });

  it("submitting calls the UPDATE mutation with params:{id} + the body, and calls onDone (no forced navigate)", async () => {
    const emitSpy = vi.spyOn(toastBus, "emit");
    const onDone = vi.fn();
    hooks.updateMutation.mutate = vi.fn((_vars, opts) => {
      opts?.onSuccess?.();
    });
    render(<SignalCreateForm initial={CUSTOM_THING} onDone={onDone} />);

    await userEvent.click(screen.getByTestId(SignalCreateFormTestId.Submit));

    // Async `handleSubmit` — see the create-mode test above. This is the one that
    // actually flaked on CI.
    await waitFor(() =>
      expect(hooks.updateMutation.mutate).toHaveBeenCalledWith(
        {
          params: { id: "custom-thing" },
          body: {
            from: "loom",
            label: "Custom Thing",
            description: "an operator-registered signal",
            severityBearing: false,
          },
        },
        expect.objectContaining({ onSuccess: expect.any(Function) }),
      ),
    );
    expect(hooks.createMutation.mutate).not.toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
    expect(onDone).toHaveBeenCalled();
    expect(emitSpy).toHaveBeenCalledWith(expect.objectContaining({ severity: "ok" }));
  });

  it("Cancel in edit mode calls onDone instead of navigating back", async () => {
    const onDone = vi.fn();
    render(<SignalCreateForm initial={CUSTOM_THING} onDone={onDone} />);
    await userEvent.click(screen.getByTestId(SignalCreateFormTestId.Cancel));
    expect(onDone).toHaveBeenCalled();
    expect(back).not.toHaveBeenCalled();
  });
});
