import { ObjectData } from "./ObjectData";
import { getSetsSettings } from "../main";
import { SetsSettings } from "../Settings";
import { OperatorName, getOperatorById } from "./Operator";
import { AttributeDefinition } from "./AttributeDefinition";
import { VaultDB } from "./VaultDB";
import { getDynamicValue, isDynamic } from "./DynamicValues";

export enum IntrinsicAttributeKey {
    FileName = "__bname",
    FileCreationDate = "__ctime",
    FileModificationDate = "__mtime",
    FilePath = "__path",
}

export function isIntrinsicAttribute(key: IntrinsicAttributeKey | string): key is IntrinsicAttributeKey {
    return (Object.values(IntrinsicAttributeKey).includes(key as IntrinsicAttributeKey) );
}

export type ExtrinsicAttributeKey = string;

export type AttributeKey = IntrinsicAttributeKey | ExtrinsicAttributeKey;

export type Clause = [AttributeKey, OperatorName, any];

export type SortField = [AttributeKey, boolean]; // false = ascending, true = descendig

// export type Clause = {
//     at: AttributeClause,
//     op: OperatorName,
//     val: any
// }
// export type Query = Clause[];

export class Query {
    private _clauses: Clause[];
    private _settings: SetsSettings;
    private _hasExtrinsic: boolean;
    private _attributes: AttributeDefinition[];
    private _db: VaultDB;
    private _canCreate: boolean;
    private _context?: ObjectData;
    private _sortBy: SortField[];

    protected constructor(db: VaultDB, clauses: Clause[], sort: SortField[], context?: ObjectData) {
        this._db = db;
        const operators = clauses.map(clause => getOperatorById(clause[1]))
        this._clauses = clauses.sort((a,b)=>{
            const aSelectiveness = getOperatorById(a[1]).selectiveness;
            const bSelectiveness = getOperatorById(b[1]).selectiveness;
            return aSelectiveness - bSelectiveness

        });
        this._settings = getSetsSettings();
        const attributes = clauses.map(([key]) => key);
        this._hasExtrinsic = attributes.some(key => !isIntrinsicAttribute(key));
        this._attributes = attributes.map(key => this._db.getAttributeDefinition(key));
        this._canCreate = operators.every(op => {
            return op.enforce !== undefined;
        })
        this._context = context;
        this._sortBy = sort.slice().reverse();
    }

    static __fromClauses(db: VaultDB, clauses: Clause[] | Clause, sort: SortField[], context?: ObjectData) {
        if (Array.isArray(clauses) && Array.isArray(clauses[0]))
            return new Query(db,clauses, sort, context);
        else return new Query(db, [clauses as Clause], sort, context);
    }

    matches(data: ObjectData) {
        if (!data) return false;

        // this to exclude files with no frontmatter 
        // in the common case of querying for metadata
        if(this._hasExtrinsic && !data.frontmatter) return false;

        const res = this._clauses.every((clause) => {
            // const attr = getAttribute(data, clause.at);
            const [at, op, val] = clause;
            const attr = this._db.getAttributeDefinition(at);
            const operator = getOperatorById(op);
            let value = val;
            // const val = clause.val; 
            if(isDynamic(val)) value = getDynamicValue(val,attr,data.db,this._context);
            return operator.matches(attr, data, value, this._context);
        });

        return res;
    }

    inferSetType(): string | undefined {
        const typeClauses = this.getClausesByAttr(this._settings.typeAttributeKey);
        if (typeClauses.length > 0) return typeClauses[0][2] as string;
    }

    inferCollection(): string | undefined {
        const collClauses = this.getClausesByAttr(this._settings.collectionAttributeKey)
        .filter(c => c[1]==="hasall" || c[1] === "hasany")
        .filter(c => c[2] === "@link-to-this")
        ;

        if (collClauses.length > 0 && this._context) {
            const link = this._db.generateWikiLink(this._context.file)
            return link;
        }
        
    }

    getClausesByAttr(key: AttributeKey, op: OperatorName="eq"): Clause[] {
        const clauses = this._clauses.filter(
            ([at, clop, _]) =>
                at === key && clop === op
        );
        return clauses;
    }

    get clauses() {
        return this._clauses;
    }

    get canCreate() {
        return this._canCreate;
    }

    get context() {
        return this._context;
    }

    get sortby() {
        return this._sortBy;
    }
}


