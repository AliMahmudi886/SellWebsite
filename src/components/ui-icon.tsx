export type IconName="search"|"shopping-bag"|"plus"|"minus"|"sparkles"|"house"|"arrow-left"|"x"|"pencil"|"archive"|"package"|"truck"|"heart"|"check";
export function UiIcon({name,className=""}:{name:IconName;className?:string}){
 return <span aria-hidden="true" className={`ui-icon ui-icon-${name} ${className}`.trim()}/>;
}
