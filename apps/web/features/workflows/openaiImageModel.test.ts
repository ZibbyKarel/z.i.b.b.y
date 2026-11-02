import { describe, expect, it } from "vitest";
import { toolOpenAiImageModel } from "./openaiImageModel";

describe("toolOpenAiImageModel", () => {
  it("is the default model for PF_IMAGE_PROVIDER=openai", () => {
    expect(
      toolOpenAiImageModel([
        "PF_IMAGE_PROVIDER=openai PF_VISION_PROVIDER=none product-factory produce",
      ]),
    ).toBe("gpt-image-2.5-flare");
  });
  it("takes PF_OPENAI_IMAGE_MODEL from the command", () => {
    expect(
      toolOpenAiImageModel(["PF_IMAGE_PROVIDER=openai PF_OPENAI_IMAGE_MODEL=gpt-image-x produce"]),
    ).toBe("gpt-image-x");
  });
  it("is undefined for other providers and plain tools", () => {
    expect(toolOpenAiImageModel(["PF_IMAGE_PROVIDER=mflux product-factory cast"])).toBeUndefined();
    expect(toolOpenAiImageModel(["product-factory render"])).toBeUndefined();
    expect(toolOpenAiImageModel(undefined)).toBeUndefined();
  });
});
