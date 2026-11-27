import { THEME_CHOICES, THEME_STORAGE_KEY } from "./theme";

const explicitThemes = THEME_CHOICES.filter((choice) => choice !== "system");

export const THEME_SCRIPT = `try{var t=localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)});if(${JSON.stringify(explicitThemes)}.indexOf(t)>=0)document.documentElement.setAttribute("data-theme",t)}catch(e){}`;
