import { createBashTool } from "./bash";
import { createEditTool } from "./edit";
import { createFindTool } from "./find";
import { createGrepTool } from "./grep";
import { createLsTool } from "./ls";
import { createReadTool } from "./read";
import { createWriteTool } from "./write";

export const defaultTools = [
  createReadTool(),
  createBashTool(),
  createEditTool(),
  createWriteTool(),
  createGrepTool(),
  createFindTool(),
  createLsTool(),
];
