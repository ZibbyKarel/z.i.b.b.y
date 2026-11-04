"use client";

import { Panel, Stack, Toggle, Typography } from "@zibby/design-system";
import { useTranslations } from "next-intl";
import { useEffect, useState, useSyncExternalStore } from "react";
import { apiClient } from "../../../state/api";
import {
  useSubscribeWebPushMutation,
  useUnsubscribeWebPushMutation,
} from "../../web-push/mutations";
import { urlBase64ToUint8Array } from "../../web-push/urlBase64ToUint8Array";

const subscribeNever = () => () => undefined;

type Hint = "hint" | "denied" | "error" | "tokenRequired";

function isSupported(): boolean {
  return (
    typeof navigator !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    // The Electron shell exposes PushManager but has no push service behind it.
    !/\bElectron\//.test(navigator.userAgent)
  );
}

/** Opt-in browser push for Tier-3 operator events (works with the tab closed). */
export function WebPushSection() {
  const t = useTranslations("settings.webPush");
  const subscribe = useSubscribeWebPushMutation();
  const unsubscribe = useUnsubscribeWebPushMutation();
  const supported = useSyncExternalStore(subscribeNever, isSupported, () => true);
  const [checked, setChecked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [hint, setHint] = useState<Hint>("hint");

  useEffect(() => {
    if (!supported) return;
    void navigator.serviceWorker
      .getRegistration()
      .then((registration) => registration?.pushManager.getSubscription())
      .then((subscription) => setChecked(Boolean(subscription)))
      .catch(() => undefined);
  }, [supported]);

  async function enable() {
    let subscription: PushSubscription | undefined;
    try {
      const registration = await navigator.serviceWorker.register("/sw.js");
      if ((await Notification.requestPermission()) !== "granted") {
        setHint("denied");
        return;
      }
      const { body } = await apiClient.webPush.getWebPushPublicKey.query();
      if (body === undefined || !("publicKey" in body)) throw new Error("no public key");
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(body.publicKey),
      });
      const result = await subscribe.mutateAsync({
        body: subscription.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } },
      });
      if (result.status !== 200) throw result;
      setChecked(true);
      setHint("hint");
    } catch (error) {
      // Don't leave a browser subscription the server never stored.
      await subscription?.unsubscribe().catch(() => undefined);
      const status = (error as { status?: number } | null)?.status;
      setHint(status === 401 ? "tokenRequired" : "error");
    }
  }

  async function disable() {
    try {
      const registration = await navigator.serviceWorker.getRegistration();
      const subscription = await registration?.pushManager.getSubscription();
      if (subscription) {
        const { endpoint } = subscription;
        await subscription.unsubscribe();
        unsubscribe.mutate({ body: { endpoint } });
      }
      setChecked(false);
      setHint("hint");
    } catch {
      setHint("error");
    }
  }

  return (
    <Panel header={t("title")} padding="300">
      <Stack align="center" direction="row" gap="250" justify="between">
        <Stack gap="50">
          <Typography type="text" weight="medium">
            {t("label")}
          </Typography>
          <Typography mono leading="snug" size="2xs" type="note" variant="tertiary">
            {supported ? t(hint) : t("unsupported")}
          </Typography>
        </Stack>
        <Toggle
          checked={checked}
          disabled={!supported || busy}
          label={t("label")}
          onChange={(next) => {
            setBusy(true);
            void (next ? enable() : disable()).finally(() => setBusy(false));
          }}
        />
      </Stack>
    </Panel>
  );
}
