/* eslint-disable @typescript-eslint/ban-types */
import { debounce, ItemView,  WorkspaceLeaf } from "obsidian";


import { SetsSettings } from "src/Settings";
import { getSetsSettings } from "src/main";
export const SETS_VIEW = "Sets-view";




export class SetsView extends ItemView {
    settings: SetsSettings;
   
    state = {

    };



    constructor(leaf: WorkspaceLeaf) {
        super(leaf);
        // this.settings = (this.app as any).plugins.plugins["obsidian-Sets"].settings as SetsSettings;
        this.settings = getSetsSettings();
        this.state = {

        };
        this.icon = "sigma";
    }

    getViewType() {
        return SETS_VIEW;
    }

    getDisplayText() {
        return "Sets";
    }

    override onResize(): void {
        super.onResize();
        this.handleResize();
    }

    handleResize = debounce(() => {
        this.render();
    }, 300);




    render() {

       
    }



    async onOpen() {
        const { contentEl } = this;

        this.render();

    }

    async onClose() {

    }
}
