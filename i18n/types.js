/**
 * @typedef {'en' | 'fa'} Locale
 */

export const LOCALES = ['en', 'fa'];

/**
 * @typedef {Object} UiCopy
 * @property {string} appWelcome
 * @property {string} sandboxSeeded
 * @property {string} progressSaved
 * @property {string} lesson
 * @property {string} lessonTitle
 * @property {string} help
 * @property {string} levels
 * @property {string} guide
 * @property {string} hint
 * @property {string} solution
 * @property {string} undo
 * @property {string} reset
 * @property {string} sandboxBtn
 * @property {string} language
 * @property {string} menuLabel
 * @property {string} sandboxTitle
 * @property {string} learningGuide
 * @property {string} guideAlwaysOn
 * @property {string} startHere
 * @property {string[]} startHereItems
 * @property {string} youAreLearning
 * @property {string} fieldNotesTitle
 * @property {string} typeNextTitle
 * @property {string} remainingLabel
 * @property {string} wrongCommandNote
 * @property {string} sandboxTip
 * @property {string[]} sandboxTipItems
 * @property {string} noActiveLevel
 * @property {string} noActiveLevelDetail
 * @property {string} guideFlashNote
 * @property {string} allSolutionMet
 * @property {string} pickChallenge
 * @property {string} howToRead
 * @property {string} difficultyLegend
 * @property {string} idealLegend
 * @property {string} solvedLegend
 * @property {string} solvedLabel
 * @property {string} levelsTitle
 * @property {string} aboutTitle
 * @property {string} githubTitle
 * @property {string} support
 * @property {string} supportTitle
 * @property {string} visitorsTitle
 * @property {string} guidePanel
 * @property {string} uiGuideTitle
 * @property {string} close
 * @property {string} levelComplete
 * @property {string} shareTitle
 * @property {string} copyPost
 * @property {string} copied
 * @property {string} shareGroupLabel
 * @property {string} linkedin
 * @property {string} xTwitter
 * @property {string} whatsapp
 * @property {string} telegram
 * @property {string} lastInPack
 * @property {string} baskInIt
 * @property {string} browseLevels
 * @property {string} appliedStepsTitle
 * @property {string} dataPreviewTitle
 * @property {string} generatedMTitle
 * @property {string} copyMCode
 * @property {string} mCopied
 * @property {string} noRows
 * @property {string} noValueYet
 * @property {string} readyStatus
 * @property {string} highlightThis
 * @property {string} useIt
 * @property {string} schemaTitle
 * @property {(n: number) => string} tablesCount
 * @property {string} rowsLabel
 * @property {string} peekLabel
 * @property {string} peekTitle
 * @property {string} insertTableTitle
 * @property {string} insertColTitle
 * @property {string} previewingSource
 * @property {string} returnToStep
 * @property {string} dockViewBoth
 * @property {string} dockViewGoal
 * @property {string} dockViewTables
 * @property {string} noTablesInLevel
 * @property {Array<{id: string, selector: string, title: string, what: string, how: string}>} helpSections
 * @property {(n: number) => string} difficultyOf
 * @property {(best: number, par: number) => string} bestSoFar
 * @property {(par: number) => string} idealSolution
 * @property {(count: number, par: number) => string} commandsUsed
 * @property {(par: number) => string} idealForLevel
 * @property {(par: number) => string} idealForLevelShort
 * @property {(nextId: string, nextTitle: string) => string} nextCelebration
 * @property {(nextId: string) => string} celebrateOn
 */
