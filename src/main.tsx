import { 
  addIcon, 
  Command, 
  Editor, 
  MarkdownFileInfo, 
  MarkdownView, 
  Menu, 
  MenuItem, 
  Notice, 
  Plugin, 
  TAbstractFile, 
  TFile, 
  WorkspaceLeaf,
  finishRenderMath, 
  loadMathJax 
} from "obsidian";

import { CODEBLOCK_NAME, DEFAULT_SETTINGS, SetsSettings } from "src/Settings";
import { SetsSettingsTab } from "src/SettingTab";

import { SetsView, SETS_VIEW } from "src/Views/SetsView";
import { processCodeBlock } from "src/Views/processCodeBlock";
import { NameInputModal } from "src/Views/NameInputModal";
import { NewTypeModal } from "src/Views/NewTypeModal";
import { NewCollectionModal } from "src/Views/NewCollectionModal";
import { NameValueSuggestModal } from "src/Views/NameValueSuggestModal";

import { VaultDB } from "src/Data/VaultDB";

import registerPasswordPropertyType from "src/propertytypes/password";
import registerLinkPropertyType from "src/propertytypes/link";

import { slugify, unslugify } from "src/Utils/slugify";
import { Show } from "solid-js";

let gSettings: SetsSettings;

export function getSetsSettings() {
  return gSettings;
}

export default class SetsPlugin extends Plugin {
  settings: SetsSettings;
  private _vaultDB: VaultDB;
  private _instanceCommands: Command[] = [];

  async onload() {
    await this.loadSettings();

    // Example icons:
    const board = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"
      fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"
      stroke-linejoin="round" class="lucide lucide-kanban">
      <path d="M6 5v11"/><path d="M12 5v6"/><path d="M18 5v14"/>
      </svg>`;

    const file_stack = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"
      fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"
      stroke-linejoin="round" class="lucide lucide-file-stack">
      <path d="M16 2v5h5"/><path d="M21 6v6.5c0 .8-.7 1.5-1.5 1.5h-7c-.8 0-1.5-.7
        -1.5-1.5v-9c0-.8.7-1.5 1.5-1.5H17l4 4z"/>
      <path d="M7 8v8.8c0 .3.2.6.4.8.2.2.5.4.8.4H15"/>
      <path d="M3 12v8.8c0 .3.2.6.4.8.2.2.5.4.8.4H11"/>
      </svg>`;

    addIcon("board", board);
    addIcon("collection", file_stack);

    // Register our sidebar view
    this.registerView(SETS_VIEW, (leaf) => new SetsView(leaf, this));

    // Show at startup if user wants
    this.app.workspace.onLayoutReady(() => {
      if (this.settings.showAtStartup) {
        this.activateView();
      }
    });

    // Code block processors, math, etc.
    this.registerCodeBlock();
    this.registerPostProcessor();

    // property types
    this.registerNewTypes();

    // plugin settings
    this.addSettingTab(new SetsSettingsTab(this.app, this));

    // set up vault DB
    this._vaultDB = new VaultDB(this);
    this.onVaultDBInitialized();

    this.onFileMenu = this.onFileMenu.bind(this);

    this.registerEvent(this.app.workspace.on("file-menu", this.onFileMenu));
    this.registerEvent(this.app.workspace.on("editor-menu", this.onEditorMenu));
 
    const mtm = this.app.metadataTypeManager;
  if (mtm?.setType) {
    // In some versions, “tags” might be spelled "tag" or "tags" 
    // depending on how they've set up the property widget type.
    // If “tags” doesn’t work, try “tag” or check in “Operator.ts” or “registeredTypeWidgets”.
    mtm.setType("expandedTags", "tags");
    mtm.savePropertyInfo?.();
  }
}

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    gSettings = this.settings;
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }

  onVaultDBInitialized() {
    this.registerCommands();
    this.vaultDB.on("metadata-changed", () => {
      this.registerNewInstancesCommands();
    });
  }

  registerCommands() {
    this.addCommand({
      id: "open-sidebar",
      name: "Open Sets sidebar",
      callback: () => this.activateView(),
    });

    this.addCommand({
      id: "new-type",
      name: "Create new type",
      callback: () => {
        new NewTypeModal(this.app, this).open();
      },
    });

    this.addCommand({
      id: "new-collection",
      name: "Create new collection",
      callback: () => {
        new NewCollectionModal(this.app, this).open();
      },
    });

    // Add note to an existing collection:
    this.addCommand({
      id: "add-to-collection",
      name: "Add to collection",
      checkCallback: (checking: boolean) => {
        const view = this.app.workspace.getActiveViewOfType(MarkdownView);
        if (checking) {
          return !!view;
        } else {
          if (view) {
            const file = view.file;
            if (file instanceof TFile) {
              const { collectionLinks, currentColl } = this.getAvailableCollections(file);
              const nameValues = collectionLinks.map((cl) => ({
                name: cl.col.file.basename,
                value: cl.link,
              }));
              new NameValueSuggestModal(this.app, nameValues, (item) => {
                currentColl.push(item.value);
                this.app.fileManager.processFrontMatter(file, (fm) => {
                  fm[this.settings.collectionAttributeKey] = currentColl;
                });
              }).open();
            }
          }
          return false;
        }
      },
    });

    // For each type, create a new item
    this.registerNewInstancesCommands();
  }

  public registerNewInstancesCommands() {
    const actualTypes = this._vaultDB.getTypeNames();

    // Skip if we already have them
    actualTypes.forEach((type) => {
      if (this._instanceCommands.find((cmd) => cmd.id === `${this.manifest.id}:new-instance-${type}`)) {
        return;
      }
      const cmd = this.addCommand({
        id: `new-instance-${type}`,
        name: `Create new ${unslugify(type)}`,
        callback: async () => {
          new NameInputModal(
            this.app,
            `Enter ${unslugify(type)} name`,
            `${unslugify(type)} name`,
            "",
            async (name) => {
              try {
                const file: TFile = await this._vaultDB.createNewInstance(type, name);
                // open file
                if (file) {
                  await this.app.workspace.openLinkText(file.path, file.path, true);
                } else {
                  new Notice("Could not create file");
                }
              } catch (e) {
                new Notice(e.message);
              }
            }
          ).open();
        },
      });
      this._instanceCommands.push(cmd);
    });

    // Remove any that no longer correspond to existing types
    let toRemove: Command[] = [];
    this._instanceCommands.forEach((cmd) => {
      const typeFromId = cmd.id.replace(`${this.manifest.id}:new-instance-`, "");
      if (!actualTypes.includes(typeFromId)) {
        this.app.commands.removeCommand(cmd.id);
        toRemove.push(cmd);
      }
    });
    toRemove.forEach((cmd) => {
      this._instanceCommands.splice(this._instanceCommands.indexOf(cmd), 1);
    });
  }

  registerNewTypes() {
    registerPasswordPropertyType(this.app);
    // registerLinkPropertyType(this.app); // Example if needed

    // This ensures obsidian re-checks any property definitions
    if (this.app.metadataTypeManager.savePropertyInfo) {
      this.app.metadataTypeManager.savePropertyInfo();
    }
    if (this.app.metadataTypeManager.updatePropertyInfoCache) {
      this.app.metadataTypeManager.updatePropertyInfoCache();
    }
  }

  async registerCodeBlock() {
    await loadMathJax();
    await finishRenderMath();
    this.registerMarkdownCodeBlockProcessor(CODEBLOCK_NAME, (source, el, ctx) => {
      processCodeBlock(source, el, this, ctx);
    });
  }

  async registerPostProcessor() {
    // If you need custom post-processing, do it here
  }

  async registerEditorExtensions() {
    // If you need editor extensions, do it here
  }

  async activateView() {
    let leaf = this.app.workspace.getLeavesOfType(SETS_VIEW)[0];
    if (!leaf) {
      await this.app.workspace.getRightLeaf(false).setViewState(
        {
          type: SETS_VIEW,
          active: true,
        },
        { settings: this.settings }
      );
      leaf = this.app.workspace.getLeavesOfType(SETS_VIEW)[0];
    }
    leaf && this.app.workspace.revealLeaf(leaf);
  }

  onunload() {
    this.vaultDB.dispose();
    this.app.workspace.off("file-menu", this.onFileMenu);
    this.app.workspace.off("editor-menu", this.onEditorMenu);
  }

  get vaultDB(): VaultDB {
    return this._vaultDB;
  }

  private onFileMenu(menu: Menu, file: TAbstractFile, source: string, leaf?: WorkspaceLeaf) {
    if (!(file instanceof TFile)) return;
    const { collectionLinks, currentColl } = this.getAvailableCollections(file);
    if (collectionLinks.length > 0) {
      menu.addItem((menuItem: MenuItem) => {
        menuItem.setTitle("Add to collection...");
        collectionLinks.forEach((cl) => {
          menuItem.setSubmenu().addItem((subItem: MenuItem) => {
            subItem.setTitle(cl.col.file.basename);
            subItem.callback = () => {
              currentColl.push(cl.link);
              this.app.fileManager.processFrontMatter(file, (fm) => {
                fm[this.settings.collectionAttributeKey] = currentColl;
              });
            };
          });
        });
      });
    }
  }

  private onEditorMenu(menu: Menu, editor: Editor, info: MarkdownView | MarkdownFileInfo) {
    // If you need custom context-menu items in the editor
  }

  private getAvailableCollections(file: TFile) {
    const collections = this.vaultDB.getCollections();
    const meta = this.app.metadataCache.getFileCache(file);
    const currentColl = (meta?.frontmatter?.[this.settings.collectionAttributeKey] as string[]) || [];
    let collectionLinks = collections.map((col) => ({
      col,
      link: this.vaultDB.generateWikiLink(col.file, "/"),
    }));
    collectionLinks = collectionLinks.filter((cl) => !currentColl.includes(cl.link));
    return { collectionLinks, currentColl };
  }
}
