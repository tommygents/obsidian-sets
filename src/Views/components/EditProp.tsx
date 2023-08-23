import { Component, onMount } from "solid-js";
import { AttributeDefinition } from "src/Data/AttributeDefinition";
import { ObjectData } from "src/Data/ObjectData";

export const EditProp: Component<{ data: ObjectData; attribute: AttributeDefinition; }> = (props) => {

    // const key = props.attribute.key;
    // const propertyInfo = app.metadataTypeManager.getPropertyInfo(key);
    // const type = app.metadataTypeManager.getAssignedType(key) || propertyInfo?.type;
    // const widget = app.metadataTypeManager.registeredTypeWidgets[type];

    const widget = props.attribute.getPropertyWidget?.();

    // const value = getAttribute(props.data, props.attribute);
    const value = props.attribute.getValue(props.data);
    if(!props.attribute.getPropertyInfo) return <div>Uh oh...</div>
    const {key, type} = props.attribute.getPropertyInfo();
    // eslint-disable-next-line prefer-const
    let div: HTMLDivElement | undefined = undefined;

    const onClick = (e:MouseEvent) => {
        console.log(e);
        const msc = e.target as HTMLDivElement;
        if(msc && msc.classList.contains("multi-select-container")){
            const input = msc.querySelector(".multi-select-input") as HTMLDivElement;
            input?.focus();
        }
    }

    onMount(() => {
        widget && widget.render(div!, {
            key, type, value
        },
            {
                app: app,
                key,
                onChange: (val) => {
                    console.log(`what to do now? `, val);
                    const owner = props.data.file;
                    // const fm = {...props.data.frontmatter, [key]: val}
                    app.fileManager.processFrontMatter(owner, (fm) => {
                        fm[key] = val;
                    });
                },
                rerender: () => {
                    console.log(`re-render called`);
                },
                sourcePath: props.data.file.path,
                blur: () => {
                    console.log(`blur called`);
                },
                metadataEditor: null
            }

        );
    });

    return <div ref={div} onClick={onClick}></div>;
};
