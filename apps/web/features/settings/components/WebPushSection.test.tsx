import { renderWithProviders as render, screen, waitFor } from "../../../test/render";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WebPushSection } from "./WebPushSection";

const subscribe = vi.fn();
const unsubscribe = vi.fn();

vi.mock("../../web-push/mutations", () => ({
  useSubscribeWebPushMutation: () => ({ mutate: subscribe }),
  useUnsubscribeWebPushMutation: () => ({ mutate: unsubscribe }),
}));
vi.mock("../../../state/api", () => ({
  apiClient: {
    webPush: {
      getWebPushPublicKey: {
        query: () => Promise.resolve({ status: 200, body: { publicKey: "AQAB" } }),
      },
    },
  },
}));

const ENDPOINT = "https://push.example/abc";
const SUB_JSON = { endpoint: ENDPOINT, keys: { p256dh: "p", auth: "a" } };
const pushSubscribe = vi.fn();
const register = vi.fn();
const requestPermission = vi.fn();

function stubBrowser() {
  pushSubscribe.mockResolvedValue({ endpoint: ENDPOINT, toJSON: () => SUB_JSON });
  register.mockResolvedValue({ pushManager: { subscribe: pushSubscribe } });
  vi.stubGlobal("PushManager", class {});
  vi.stubGlobal("Notification", { requestPermission });
  Object.defineProperty(navigator, "serviceWorker", {
    configurable: true,
    value: { register, getRegistration: () => Promise.resolve(undefined) },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  stubBrowser();
});
afterEach(() => {
  vi.unstubAllGlobals();
  Reflect.deleteProperty(navigator, "serviceWorker");
});

describe("WebPushSection", () => {
  it("shows the unsupported hint when the browser has no PushManager", () => {
    // jsdom has no PushManager by default
    vi.unstubAllGlobals();
    Reflect.deleteProperty(window, "PushManager");
    render(<WebPushSection />);
    expect(screen.getByRole("switch")).toBeDisabled();
    expect(screen.getByText(/nepodporuje/)).toBeInTheDocument();
  });

  it("enabling subscribes and posts the subscription", async () => {
    requestPermission.mockResolvedValue("granted");
    render(<WebPushSection />);
    await userEvent.click(screen.getByRole("switch"));
    await waitFor(() => expect(subscribe).toHaveBeenCalledWith({ body: SUB_JSON }));
    expect(register).toHaveBeenCalledWith("/sw.js");
  });

  it("denied permission shows the denied hint and does not subscribe", async () => {
    requestPermission.mockResolvedValue("denied");
    render(<WebPushSection />);
    await userEvent.click(screen.getByRole("switch"));
    expect(await screen.findByText(/zablokovaná/)).toBeInTheDocument();
    expect(pushSubscribe).not.toHaveBeenCalled();
    expect(subscribe).not.toHaveBeenCalled();
  });
});
