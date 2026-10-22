"use client";

import { Container, List, ListItem, SearchInput, Stack, Typography } from "@zibby/design-system";
import { useLocale, useTranslations } from "next-intl";
import { useDeferredValue, useState } from "react";
import { apiClient } from "../../../state/api";
import { useChat } from "../ChatContext";
import { useChatConversationsQuery } from "../queries";

export enum ChatHistorySidebarTestId {
  Search = "chat-history-search",
  Empty = "chat-history-empty",
}

/**
 * The chat dock's history sidebar: recent conversations (newest first) with a
 * full-text search. Picking one loads its transcript into the dock and makes it
 * the thread the next turn resumes.
 */
export function ChatHistorySidebar() {
  const t = useTranslations("chat.history");
  const locale = useLocale();
  const { conversationId, setConversationId, setMessages } = useChat();
  const [search, setSearch] = useState("");
  const q = useDeferredValue(search.trim());
  const { data } = useChatConversationsQuery(q || undefined);
  const conversations = data ?? [];

  const openConversation = async (id: string) => {
    const res = await apiClient.chat.getTranscript.query({ query: { conversationId: id } });
    if (res.status !== 200) return;
    setConversationId(res.body.conversationId);
    setMessages(res.body.messages);
  };

  return (
    <Stack align="stretch" direction="col" gap="200">
      <SearchInput
        ariaLabel={t("search")}
        data-testid={ChatHistorySidebarTestId.Search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder={t("search")}
        value={search}
      />
      {conversations.length === 0 ? (
        <Typography data-testid={ChatHistorySidebarTestId.Empty} type="note" variant="tertiary">
          {q ? t("noMatch") : t("empty")}
        </Typography>
      ) : (
        <List>
          {conversations.map((c) => (
            <ListItem
              active={c.conversationId === conversationId}
              id={c.conversationId}
              key={c.conversationId}
              onSelect={() => void openConversation(c.conversationId)}
              title={c.title}
            >
              <Container grow minWidth="0">
                <Stack align="stretch" direction="col" gap="25">
                  <Typography truncate type="body">
                    {c.title || t("untitled")}
                  </Typography>
                  <Typography type="note" variant="tertiary">
                    {new Date(c.updatedAt).toLocaleString(locale, {
                      dateStyle: "short",
                      timeStyle: "short",
                    })}
                  </Typography>
                </Stack>
              </Container>
            </ListItem>
          ))}
        </List>
      )}
    </Stack>
  );
}
