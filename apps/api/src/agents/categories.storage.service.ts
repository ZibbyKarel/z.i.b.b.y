import { Inject, Injectable } from "@nestjs/common";
import { CategoryManifestStore } from "../shared/categories/category-manifest-store";
import { AGENTS_DIR } from "./agents.storage.service";

/**
 * Category taxonomy for the agent catalog. Lives in the agents data directory
 * alongside the agent `.md` files, in its own `_categories.json` manifest. An
 * agent links to a category only by its frontmatter `category` string, so a
 * category can exist with zero agents.
 */
@Injectable()
export class CategoriesStorageService extends CategoryManifestStore {
  constructor(@Inject(AGENTS_DIR) dir: string) {
    super(dir);
  }
}
