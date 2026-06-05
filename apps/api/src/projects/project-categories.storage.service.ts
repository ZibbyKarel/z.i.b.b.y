import { Inject, Injectable } from "@nestjs/common"
import { CategoryManifestStore } from "../shared/categories/category-manifest-store"
import { PROJECTS_DIR } from "./projects.storage.service"

/**
 * Category taxonomy for the project registry. Lives in the same data directory as
 * the registry manifest, keyed under its own `_categories.json` (a different file
 * name, so the two never clash).
 */
@Injectable()
export class ProjectCategoriesStorageService extends CategoryManifestStore {
  constructor(@Inject(PROJECTS_DIR) dir: string) {
    super(dir)
  }
}
