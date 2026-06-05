import { Inject, Injectable } from "@nestjs/common"
import { CategoryManifestStore } from "../shared/categories/category-manifest-store"
import { SKILLS_DIR } from "./skills.storage.service"

/**
 * Category taxonomy for the skill catalog. Lives in the skills data directory
 * alongside the `SKILL.md` files, in its own `_categories.json` manifest. A skill
 * links to a category only by its frontmatter `category` string, so a category
 * can exist with zero skills.
 */
@Injectable()
export class SkillCategoriesStorageService extends CategoryManifestStore {
  constructor(@Inject(SKILLS_DIR) dir: string) {
    super(dir)
  }
}
