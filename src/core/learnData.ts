/**
 * E3：教學資料（P5 導覽 / 題庫 / 學習路徑、P6 保養 / 情境）。只能用動態 import 載入（見 loadData.ts 的 loadLearnData），
 * 不要從首包會用到的檔案直接 import，否則 Vite 會把它們併回首包。
 */
import { ProcedureFile, QuizFile, LevelFile, MaintenanceFile, ScenarioFile, type Procedure, type Quiz, type Level, type Maintenance, type Scenario } from './schema'
import levelsJson from '../../data/levels.json'

const procModules = import.meta.glob('../../data/procedures/*.json', { eager: true, import: 'default' }) as Record<string, unknown>
const quizModules = import.meta.glob('../../data/quizzes/*.json', { eager: true, import: 'default' }) as Record<string, unknown>
const maintModules = import.meta.glob('../../data/maintenance/*.json', { eager: true, import: 'default' }) as Record<string, unknown>
const scnModules = import.meta.glob('../../data/scenarios/*.json', { eager: true, import: 'default' }) as Record<string, unknown>

export interface LearnData {
  /** P5：導覽程序、測驗題、學習路徑（都含兩種變體；介面自己過濾） */
  procedures: Procedure[]
  quizzes: Quiz[]
  levels: Level[]
  /** P6：保養項目、故障情境（都含兩種變體；介面自己過濾） */
  maintenance: Maintenance[]
  scenarios: Scenario[]
}

export const learnData: LearnData = {
  procedures: Object.values(procModules).flatMap(m => ProcedureFile.parse(m)),
  quizzes: Object.values(quizModules).flatMap(m => QuizFile.parse(m)),
  levels: LevelFile.parse(levelsJson),
  maintenance: Object.values(maintModules).flatMap(m => MaintenanceFile.parse(m)),
  scenarios: Object.values(scnModules).flatMap(m => ScenarioFile.parse(m)),
}
