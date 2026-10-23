import type { Meta, StoryObj } from "@storybook/react";
import { FileDiffView } from "./FileDiffView";

const meta: Meta<typeof FileDiffView> = {
  title: "DesignSystem/FileDiffView",
  component: FileDiffView,
};
export default meta;

type Story = StoryObj<typeof FileDiffView>;

const DIFF = `diff --git a/src/a.ts b/src/a.ts
index 111..222 100644
--- a/src/a.ts
+++ b/src/a.ts
@@ -1,3 +1,3 @@
 const a = 1;
-const b = 2;
+const b = 3;
 export { a, b };
diff --git a/img.png b/img.png
Binary files a/img.png and b/img.png differ
`;

export const Playground: Story = { args: { diff: DIFF } };
export const Empty: Story = { args: { diff: "" } };
export const WithFileList: Story = { args: { diff: DIFF, fileList: true } };
