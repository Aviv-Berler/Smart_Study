export type Locale = "en" | "he";

const translations = {
  en: {
    // ── Navigation & App Shell ──────────────────────────────
    appName: "Smart Study",
    dashboard: "Dashboard",
    futurePlanner: "Future Planner",
    masterTasks: "Master Tasks",
    settings: "Settings",
    insightsTitle: "Insights",
    insightsDesc: "Trends, time accuracy, and task control",
    collapseSidebar: "Collapse sidebar",
    expandSidebar: "Expand sidebar",

    // ── Greetings ───────────────────────────────────────────
    goodMorning: "Good morning",
    goodAfternoon: "Good afternoon",
    goodEvening: "Good evening",
    planForToday: "here's your plan for today",

    // ── Dashboard ───────────────────────────────────────────
    overallProgress: "Daily Overall Progress",
    tasksFinished: "tasks fully finished",
    upcomingMilestones: "Upcoming Milestones",
    daysLeft: "days left",
    dayLeft: "day left",
    overdue: "days overdue",
    prepProgress: "Prep",
    dailyTaskBoard: "Daily Task Board",
    goalForToday: "Goal for today",
    targetForToday: "Target for today",
    markSessionDone: "Mark time session as done",
    markTaskDone: "Mark task as fully finished",
    noDailyTasks: "No daily tasks yet. Add tasks to get started.",

    // ── Schedule Panel ──────────────────────────────────────
    schedule: "Schedule",
    totalScheduled: "total scheduled",
    recommended: "Recommended",
    focusNow: "Active Now",
    noScheduleToday: "No scheduled classes today",

    // ── Planner Page ────────────────────────────────────────
    plannerTitle: "Future Planner",
    plannerDesc: "Manage your courses and tasks",
    myCourses: "My Courses",
    myActiveTasks: "Active Tasks",
    addNew: "Add New",
    newTask: "New Task",
    newCourse: "New Course",
    noCoursesYet: "No courses yet. Add your first course below.",
    noTasksYet: "No tasks yet. Add your first task below.",
    noScheduleSlotsYet: "No schedule slots.",
    deleteCourse: "Delete course",
    deleteSlot: "Delete slot",
    addSlotToCourse: "Add slot",

    // ── Master Tasks Page ───────────────────────────────────
    tasksTitle: "Master Tasks",
    tasksDesc: "All your deadlines and assignments",
    activeTasks: "Active Tasks",
    deleteTask: "Delete task",
    removeFromList: "Remove from list",

    // ── Settings Page ───────────────────────────────────────
    settingsTitle: "Settings",
    settingsDesc: "Preferences and profile",
    profileSection: "Profile",
    appearanceSection: "Appearance",
    fullNameLabel: "Full Name",
    emailLabel: "Email",
    emailManagedByAuth: "Email is managed by your auth provider.",
    themeLabel: "Theme",
    languageLabel: "Language",
    lightTheme: "Light",
    darkTheme: "Dark",
    systemTheme: "System",
    savePreferences: "Save Preferences",
    savedMsg: "✓ Saved!",

    // ── Add Task Form ───────────────────────────────────────
    addTaskTitle: "Add Manual Task",
    taskTitleLabel: "Task Title",
    taskTitlePlaceholder: "e.g., Problem Set 4",
    courseNameLabel: "Course Name",
    courseNamePlaceholder: "e.g., Calculus 2",
    dueDateLabel: "Due Date",
    editDeadline: "Edit deadline",
    setDeadline: "Set deadline",
    clearDeadline: "Clear deadline",
    noDeadline: "No deadline",
    saveLabel: "Save",
    estimatedDurationLabel: "Estimated Duration (hours)",
    durationPlaceholder: "e.g., 2.5",
    addTaskBtn: "Add Task",

    // ── Add Course Form ─────────────────────────────────────
    addCourseTitle: "Add Course & Schedule",
    courseNameFormLabel: "Course Name",
    courseNameFormPlaceholder: "e.g., Data Structures",
    weeklyScheduleSlots: "Weekly Schedule Slots",
    addSlotBtn: "New Block",
    removeSlotLabel: "Remove slot",
    slotLabel: "Slot",
    typeLabel: "Type",
    dayLabel: "Day",
    startTimeLabel: "Start Time",
    durationMinLabel: "Duration (min)",
    lectureTxt: "Lecture",
    tutorialTxt: "Tutorial",
    otherTxt: "Other",
    addCourseBtn: "Save Course",

    // ── Days of week ────────────────────────────────────────
    sundayTxt: "Sunday",
    mondayTxt: "Monday",
    tuesdayTxt: "Tuesday",
    wednesdayTxt: "Wednesday",
    thursdayTxt: "Thursday",
    fridayTxt: "Friday",
    saturdayTxt: "Saturday",

    // ── Manage Page ─────────────────────────────────────────
    manageTitle: "Data Entry Hub",
    manageDesc: "Add tasks and manage course schedules",
    manageCourses: "Manage Courses",
    manageTasks: "Manage Tasks",

    // ── Auth ────────────────────────────────────────────────
    logOut: "Log Out",
    helloUser: "Hello",
    otherNoCourse: "Other / No Course",

    // ── Generic UI ──────────────────────────────────────────
    savingLabel: "Saving…",
    language: "Language",
    theme: "Theme",

    // ── Guide & Onboarding ──────────────────────────────────
    guideButton: "Guide",
    guideTitle: "How does it work?",
    guideStep1:
      "Data Entry Hub: Add your fixed courses and tasks to the system quickly and easily.",
    guideStep2:
      "Personalization: Go to Settings and define your learning style and routine.",
    guideStep3:
      "Smart Planning: Head to the Planner and create your schedule for the coming week or two, accounting for constraints and real events in chat.",
    guideFooter:
      "From here — approve plans and get to work! Goals are set — mark progress so the system learns you and responds dynamically.",
    tourStepSettings:
      "This is where the system learns you. Set your learning preferences so the agent plans correctly for you.",
    tourStepManage:
      "This is the Data Entry Hub. Add your lecture hours and assignments here.",
    tourStepPlanner:
      "This is the brain of the system. Request a plan, add constraints in chat, and approve the schedule.",
    tourStepDashboard:
      "You're on your way! Here you'll see daily tasks. If something shifts, the system recalculates your path.",
    skipTour: "Skip",
    tourNext: "Next",
    tourFinish: "Done",
    tourStepLabel: "Step",
    tourStepOf: "of",

    // ── Planning Preferences ────────────────────────────────────
    planningPrefs: "Planning Preferences",
    academicBackground: "Academic Background",
    academicBgPlaceholder: "e.g. B.Sc Computer Science, Year 1",
    dailyScheduleLabel: "Available hours per day",
    workRestLabel: "Work / Rest rhythm",
    bufferTimeLabel: "Buffer between blocks (min)",
    hobbiesLabel: "Hobbies, breaks & routine",
    hobbiesPlaceholder: "e.g. Gym Mon/Wed/Fri 7–8pm, daily walk after lunch…",
    restDayLabel: "Rest day",
    editPrefs: "Edit preferences",
    customIntervalLabel: "Custom",
    workMinsLabel: "Work min",
    restMinsLabel: "Rest min",
    noAcademicBg: "No academic background set",
    learningStyleLabel: "Learning style",
    styleVisual: "Visual (diagrams, videos)",
    styleReading: "Reading / Writing",
    stylePractice: "Practice / Problems",
    styleMixed: "Mixed",
    savePrefsBtn: "Save preferences",
    pomodoroLabel: "25/5 — Pomodoro",
    focusLabel: "50/10 — Focus",
    deepWorkLabel: "90/20 — Deep Work",

    // ── Smart Planner / Calendar ────────────────────────────────
    goalsLabel: "Goals",
    smartSyncTitle: "Smart Sync",
    smartSyncDesc: "AI study planner",
    constraintsLabel: "Any special constraints for the next few days?",
    constraintsPlaceholder: "e.g. No studying Thursday evening, part-time shift on Friday…",
    generationLimitsNote:
      "Note: Limited to 3 generations per hour. The AI plans around your existing schedule – for a completely new plan, clear the calendar blocks first.",
    generatePlan: "Generate Plan",
    generatingPlan: "Generating…",
    approvePlan: "Approve Plan",
    discardPlan: "Discard Plan",
    discardingPlan: "Discarding…",
    planDiscarded: "Proposed plan discarded.",
    approvingPlan: "Approving…",
    undoApproval: "Undo Approval",
    undoingApproval: "Undoing…",
    chooseApproach: "Choose an approach:",
    aiPrefix: "AI:",
    blocksScheduled: "study blocks scheduled!",
    blockScheduled: "study block scheduled!",
    conflictWarning: "Scheduling conflict — choose an option below.",
    planApproved: "Plan approved! Blocks locked. Daily targets created on the Dashboard.",
    boardCleared: "Board cleared — blocks removed.",
    resetFailed: "Reset failed:",
    doneLabel: "done",
    driftAlertMessage:
      "Hey — we noticed you missed some tasks yesterday. How would you like to close the gap?",
    driftAutoFix: "Fix it for me",
    driftManualFix: "I'll handle it",
    driftAutoFixing: "Recalculating…",
    driftAutoFixFailed: "Could not recalculate schedule.",
    missedBlockLegend: "Missed session — drag forward to reschedule",
    pillLegend: "Pill = time session done",
    circleLegend: "Circle = goal complete · advances task progress",
    plannerLinkHint: "Generate and approve a plan in the",
    smartPlannerLink: "Smart Planner",
    plannerLinkSuffix: "to see your daily targets here.",
    prevWeek: "Previous Week",
    nextWeek: "Next Week",
    calendarToday: "Today",
    loadingWeek: "Loading week…",

    // ── Insights ────────────────────────────────────────────
    insightsComingSoonTitle: "Insights Under Construction",
    insightsComingSoonBody:
      "Our engine is working in the background to analyze your study habits. Once enough data is gathered, this page will come to life with personalized insights to help you master your schedule.",
    insightsEngineCollecting: "Engine active in background · Collecting data",
    insightsPeriodLabel: "Period:",
    insightsTimeFilterAria: "Select time period",
    insightsLast7Days: "Last 7 days",
    insightsLast30Days: "Last 30 days",
    insightsDailyGoalsKpi: "Daily goal adherence",
    insightsDailyGoalsKpiDesc: "Share of daily goals completed out of all goals in this period",
    insightsTaskControlKpi: "Task control score",
    insightsHighControlCount: "{count} tasks in high control",
    insightsLowControlSummary: "{low} need attention · {active} active in period",
    insightsActiveSummary: "{active} active tasks in period",
    insightsChartTitle: "Time estimate accuracy by course",
    insightsChartDesc: "Actual time spent vs. expected time at your current progress pace",
    insightsChartEmpty:
      "Not enough time data yet — keep logging work and progressing on tasks",
    insightsChartVariance: "Variance:",
    insightsChartTaskCount: "{count} tasks",
    insightsLegendAccurate: "Accurate (±10%)",
    insightsLegendOver: "Took longer (>10%)",
    insightsLegendUnder: "Finished early (<-10%)",
    insightsRecommendationsHeading: "What does this mean for you?",
    insightsVarianceTitle: "Time estimate — worth updating",
    insightsVarianceBody:
      "We noticed that in {course} tasks take longer than planned. Consider adding a buffer to your time estimates going forward.",
    insightsUpdatePrefs: "Update preferences",
    insightsLowControlTitle: "Regain control of your schedule",
    insightsLowControlBody:
      "We noticed several tasks shifted direction or were postponed. Review your schedule and make sure the work hours you set truly support you. Sometimes all it takes is aligning work blocks with your constraints and energy to regain control.",
    insightsReplan: "Replan schedule",
    insightsStrongExecTitle: "Great work!",
    insightsStrongExecBody:
      "A high rate of daily goal completion — keep it up. Small consistent steps beat big bursts.",
    insightsKeepGoingTitle: "Keep building your data",
    insightsKeepGoingBody:
      "Log work time, check off daily goals, and adjust your plan as needed — that’s how insights become more accurate.",
    insightsGoToDashboard: "Go to daily board",

    // ── Time logger (daily board) ─────────────────────────────
    logWorkTime: "Log work time",
    loggedWorkTimePrefix: "Logged",
    loggedWorkTimeUpdateSuffix: "· Update",
    timePresetReset: "0 min / Reset",
    timePresetCompleteSuffix: "(completed)",
    timeMinShort: "{n} min",
    timeHourShort: "{h}h",
    timeHourMinShort: "{h}h {m}m",
    closeMenu: "Close menu",
  },

  he: {
    // ── Navigation & App Shell ──────────────────────────────
    appName: "Smart Study",
    dashboard: "לוח בקרה",
    futurePlanner: "מתכנן עתידי",
    masterTasks: "משימות ראשיות",
    settings: "הגדרות",
    insightsTitle: "תובנות",
    insightsDesc: "מגמות, דיוק זמן ושליטה במשימות",
    collapseSidebar: "כווץ תפריט",
    expandSidebar: "הרחב תפריט",

    // ── Greetings ───────────────────────────────────────────
    goodMorning: "בוקר טוב",
    goodAfternoon: "צהריים טובים",
    goodEvening: "ערב טוב",
    planForToday: "התוכנית שלך להיום",

    // ── Dashboard ───────────────────────────────────────────
    overallProgress: "התקדמות יומית כוללת",
    tasksFinished: "משימות הושלמו לגמרי",
    upcomingMilestones: "אבני דרך קרובות",
    daysLeft: "ימים נותרו",
    dayLeft: "יום נותר",
    overdue: "ימים באיחור",
    prepProgress: "הכנה",
    dailyTaskBoard: "לוח משימות יומי",
    goalForToday: "יעד להיום",
    targetForToday: "יעד מצטבר להיום",
    markSessionDone: "סמן מפגש כהושלם",
    markTaskDone: "סמן משימה כהושלמה לגמרי",
    noDailyTasks: "אין משימות יומיות עדיין. הוסף משימות כדי להתחיל.",

    // ── Schedule Panel ──────────────────────────────────────
    schedule: "לוח זמנים",
    totalScheduled: "סה״כ מתוכנן",
    recommended: "מומלץ",
    focusNow: "פעיל עכשיו",
    noScheduleToday: "אין שיעורים מתוכננים להיום",

    // ── Planner Page ────────────────────────────────────────
    plannerTitle: "מתכנן עתידי",
    plannerDesc: "נהל את הקורסים והמשימות שלך",
    myCourses: "הקורסים שלי",
    myActiveTasks: "משימות פעילות",
    addNew: "הוסף חדש",
    newTask: "משימה חדשה",
    newCourse: "קורס חדש",
    noCoursesYet: "אין קורסים עדיין. הוסף את הקורס הראשון שלך למטה.",
    noTasksYet: "אין משימות עדיין. הוסף את המשימה הראשונה שלך למטה.",
    noScheduleSlotsYet: "אין חריצי לוח זמנים.",
    deleteCourse: "מחק קורס",
    deleteSlot: "מחק חריץ",
    addSlotToCourse: "בלוק חדש",

    // ── Master Tasks Page ───────────────────────────────────
    tasksTitle: "משימות ראשיות",
    tasksDesc: "כל המטלות והדדליינים במקום אחד",
    activeTasks: "משימות פעילות",
    deleteTask: "מחק משימה",
    removeFromList: "הסר מהרשימה",

    // ── Settings Page ───────────────────────────────────────
    settingsTitle: "הגדרות",
    settingsDesc: "העדפות ופרופיל",
    profileSection: "פרופיל",
    appearanceSection: "מראה",
    fullNameLabel: "שם מלא",
    emailLabel: "אימייל",
    emailManagedByAuth: "האימייל מנוהל על ידי ספק ההזדהות שלך.",
    themeLabel: "ערכת נושא",
    languageLabel: "שפה",
    lightTheme: "בהיר",
    darkTheme: "כהה",
    systemTheme: "מערכת",
    savePreferences: "שמור העדפות",
    savedMsg: "✓ נשמר!",

    // ── Add Task Form ───────────────────────────────────────
    addTaskTitle: "הוסף משימה ידנית",
    taskTitleLabel: "כותרת משימה",
    taskTitlePlaceholder: "למשל, סדרת תרגילים 4",
    courseNameLabel: "שם הקורס",
    courseNamePlaceholder: "למשל, חשבון אינפי 2",
    dueDateLabel: "תאריך הגשה",
    editDeadline: "ערוך תאריך הגשה",
    setDeadline: "הגדר תאריך הגשה",
    clearDeadline: "נקה תאריך הגשה",
    noDeadline: "ללא תאריך הגשה",
    saveLabel: "שמור",
    estimatedDurationLabel: "משך מוערך (שעות)",
    durationPlaceholder: "למשל, 2.5",
    addTaskBtn: "הוסף משימה",

    // ── Add Course Form ─────────────────────────────────────
    addCourseTitle: "הוסף קורס ולוח זמנים",
    courseNameFormLabel: "שם הקורס",
    courseNameFormPlaceholder: "למשל, מבני נתונים",
    weeklyScheduleSlots: "חריצי לוח שבועי",
    addSlotBtn: "בלוק חדש",
    removeSlotLabel: "הסר חריץ",
    slotLabel: "חריץ",
    typeLabel: "סוג",
    dayLabel: "יום",
    startTimeLabel: "שעת התחלה",
    durationMinLabel: "משך (דקות)",
    lectureTxt: "הרצאה",
    tutorialTxt: "תרגול",
    otherTxt: "אחר",
    addCourseBtn: "שמור קורס",

    // ── Days of week ────────────────────────────────────────
    sundayTxt: "ראשון",
    mondayTxt: "שני",
    tuesdayTxt: "שלישי",
    wednesdayTxt: "רביעי",
    thursdayTxt: "חמישי",
    fridayTxt: "שישי",
    saturdayTxt: "שבת",

    // ── Manage Page ─────────────────────────────────────────
    manageTitle: "מרכז הזנת נתונים",
    manageDesc: "הוסף משימות ונהל לוחות זמנים של קורסים",
    manageCourses: "ניהול קורסים",
    manageTasks: "ניהול משימות",

    // ── Auth ────────────────────────────────────────────────
    logOut: "התנתקות",
    helloUser: "שלום",
    otherNoCourse: "אחר / ללא קורס",

    // ── Generic UI ──────────────────────────────────────────
    savingLabel: "שומר…",
    language: "שפה",
    theme: "ערכת נושא",

    // ── Guide & Onboarding ──────────────────────────────────
    guideButton: "מדריך",
    guideTitle: "איך זה עובד?",
    guideStep1:
      "מרכז ההזנה: מכניסים את הקורסים הקבועים והמשימות למערכת בצורה פשוטה ומהירה.",
    guideStep2:
      "התאמה אישית: נכנסים להגדרות (Settings) ומגדירים את אופי ושגרת הלמידה שלך.",
    guideStep3:
      "תכנון חכם: הולכים למתכנן (Planner) ויוצרים את לוח הזמנים לשבוע-שבועיים הקרובים, תוך התחשבות באילוצים ואירועי אמת בצ'אט.",
    guideFooter:
      "מכאן - מאשרים תוכניות ויוצאים לשבוע של עבודה! היעדים מוגדרים – סמן התקדמות כדי שהמערכת תלמד אותך ותגיב בצורה דינאמית.",
    tourStepSettings:
      "כאן המערכת לומדת אותך. הגדר העדפות למידה כדי שהסוכן יתכנן עבורך נכון.",
    tourStepManage:
      "זה מרכז ההזנה. הוסף לכאן את שעות ההרצאות והמטלות שלך.",
    tourStepPlanner:
      "זה המוח של המערכת. בקש תוכנית, הוסף אילוצים בצ'אט, ואשר את הלו\"ז.",
    tourStepDashboard:
      "יוצאים לדרך! כאן תראה משימות יומיות. אם משהו זז, המערכת תחשב מסלול מחדש.",
    skipTour: "דלג",
    tourNext: "הבא",
    tourFinish: "סיום",
    tourStepLabel: "שלב",
    tourStepOf: "מתוך",

    // ── Planning Preferences ────────────────────────────────────
    planningPrefs: "העדפות תכנון",
    academicBackground: "רקע אקדמי",
    academicBgPlaceholder: "למשל, תואר ראשון במדעי המחשב, שנה א'",
    dailyScheduleLabel: "שעות זמינות ביום",
    workRestLabel: "קצב עבודה / מנוחה",
    bufferTimeLabel: "מאגר בין בלוקים (דקות)",
    hobbiesLabel: "תחביבים, הפסקות ושגרה",
    hobbiesPlaceholder: "למשל, חדר כושר ב/ד/ו 19-20, הליכה יומית…",
    restDayLabel: "יום מנוחה",
    editPrefs: "ערוך העדפות",
    customIntervalLabel: "מותאם אישית",
    workMinsLabel: "דקות עבודה",
    restMinsLabel: "דקות מנוחה",
    noAcademicBg: "לא הוגדר רקע אקדמי",
    learningStyleLabel: "סגנון למידה",
    styleVisual: "חזותי (דיאגרמות, סרטונים)",
    styleReading: "קריאה / כתיבה",
    stylePractice: "תרגול / בעיות",
    styleMixed: "מעורב",
    savePrefsBtn: "שמור העדפות",
    pomodoroLabel: "25/5 — פומודורו",
    focusLabel: "50/10 — מיקוד",
    deepWorkLabel: "90/20 — עבודה עמוקה",

    // ── Smart Planner / Calendar ────────────────────────────────
    goalsLabel: "יעדים",
    smartSyncTitle: "סנכרון חכם",
    smartSyncDesc: "מתכנן לימודים בבינה מלאכותית",
    constraintsLabel: "אילוצים מיוחדים לימים הקרובים?",
    constraintsPlaceholder: "למשל, בלי לימודים בחמישי בערב, משמרת ביום שישי…",
    generationLimitsNote:
      "שים לב: ניתן לייצר עד 3 תוכניות בשעה. ה-AI מתכנן סביב הלו\"ז הקיים – לקבלת תוכנית חדשה לגמרי, יש לנקות את הבלוקים מהיומן תחילה.",
    generatePlan: "צור תוכנית",
    generatingPlan: "יוצר…",
    approvePlan: "אשר תוכנית",
    discardPlan: "בטל תוכנית",
    discardingPlan: "מבטל…",
    planDiscarded: "התוכנית המוצעת נמחקה.",
    approvingPlan: "מאשר…",
    undoApproval: "בטל אישור",
    undoingApproval: "מבטל…",
    chooseApproach: "בחר גישה:",
    aiPrefix: "בינה מלאכותית:",
    blocksScheduled: "בלוקי לימוד נקבעו!",
    blockScheduled: "בלוק לימוד נקבע!",
    conflictWarning: "קונפליקט בתזמון — בחר אפשרות למטה.",
    planApproved: "התוכנית אושרה! הבלוקים ננעלו. יעדים יומיים נוצרו בלוח הבקרה.",
    boardCleared: "הלוח נוקה — בלוקים הוסרו.",
    resetFailed: "איפוס נכשל:",
    doneLabel: "הושלם",
    driftAlertMessage:
      "היי, זיהינו שפספסת חלק מהמשימות אתמול. איך תרצה להשלים את הפער?",
    driftAutoFix: "סדר לי אוטומטית",
    driftManualFix: "אני אגרור בעצמי",
    driftAutoFixing: "מחשב מחדש…",
    driftAutoFixFailed: "לא ניתן לחשב מחדש את לוח הזמנים.",
    missedBlockLegend: "מפגש שפוספס — גרור קדימה לתזמון מחדש",
    pillLegend: "גלולה = מפגש זמן הושלם",
    circleLegend: "עיגול = יעד הושלם · מקדם התקדמות",
    plannerLinkHint: "צור ואשר תוכנית ב",
    smartPlannerLink: "מתכנן החכם",
    plannerLinkSuffix: "כדי לראות את היעדים היומיים שלך כאן.",
    prevWeek: "שבוע קודם",
    nextWeek: "שבוע הבא",
    calendarToday: "היום",
    loadingWeek: "טוען שבוע…",

    // ── Insights ────────────────────────────────────────────
    insightsComingSoonTitle: "התובנות שלך בבנייה",
    insightsComingSoonBody:
      "המנוע שלנו התחיל לעבוד ברקע ולנתח את הרגלי הלמידה שלך. ברגע שייאסף מספיק מידע, הדף הזה יתעורר לחיים עם תובנות אישיות שיעזרו לך להשיג שליטה מלאה בלוח הזמנים.",
    insightsEngineCollecting: "המנוע פעיל ברקע · אוסף נתונים",
    insightsPeriodLabel: "תקופה:",
    insightsTimeFilterAria: "בחירת תקופת זמן",
    insightsLast7Days: "שבוע אחרון",
    insightsLast30Days: "30 ימים אחרונים",
    insightsDailyGoalsKpi: "עמידה ביעדים היומיים",
    insightsDailyGoalsKpiDesc: "יחס יעדים יומיים שהושלמו מתוך כלל היעדים בתקופה",
    insightsTaskControlKpi: "מדד שליטה במשימות",
    insightsHighControlCount: "{count} משימות בשליטה גבוהה",
    insightsLowControlSummary: "{low} דורשות תשומת לב · {active} פעילות בתקופה",
    insightsActiveSummary: "{active} משימות פעילות בתקופה",
    insightsChartTitle: "דיוק הערכת זמן לפי קורס",
    insightsChartDesc: "השוואה בין זמן בפועל לזמן הצפוי בקצב ההתקדמות הנוכחי",
    insightsChartEmpty:
      "אין עדיין מספיק נתוני זמן לניתוח — המשך לתעד עבודה ולהתקדם במשימות",
    insightsChartVariance: "סטייה:",
    insightsChartTaskCount: "{count} משימות",
    insightsLegendAccurate: "מדויק (±10%)",
    insightsLegendOver: "לקח יותר זמן (>10%)",
    insightsLegendUnder: "הסתיים מוקדם (<-10%)",
    insightsRecommendationsHeading: "מה זה אומר בשבילך?",
    insightsVarianceTitle: "הערכת זמן — מומלץ לעדכן",
    insightsVarianceBody:
      "שמנו לב שב-{course} המשימות לוקחות יותר זמן מהמתוכנן. להבא, שקול להוסיף קצת באפר להערכת הזמנים.",
    insightsUpdatePrefs: "לעדכון העדפות",
    insightsLowControlTitle: "החזרת שליטה בלוח הזמנים",
    insightsLowControlBody:
      "שמנו לב שמספר משימות שינו כיוון או נדחו. מומלץ לעבור על הלו\"ז ולוודא ששעות העבודה שקבעת באמת תומכות בך. לפעמים כל מה שצריך זה להתאים את בלוקי העבודה לאילוצים ולאנרגיה שלך כדי להחזיר את השליטה.",
    insightsReplan: "לתכנון מחדש",
    insightsStrongExecTitle: "עבודה יפה!",
    insightsStrongExecBody:
      "אחוז גבוה של עמידה ביעדים היומיים — המשך באותה גישה. עקביות קטנה מנצחת bursts גדולים.",
    insightsKeepGoingTitle: "המשך לצבור נתונים",
    insightsKeepGoingBody:
      "תעד זמני עבודה, סמן יעדים יומיים והתאם את התכנון לפי הצורך — כך התובנות יהיו מדויקות יותר.",
    insightsGoToDashboard: "ללוח היומי",

    // ── Time logger (daily board) ─────────────────────────────
    logWorkTime: "תיעוד זמן עבודה",
    loggedWorkTimePrefix: "תועדו",
    loggedWorkTimeUpdateSuffix: "· לעדכון",
    timePresetReset: "0 דק' / איפוס",
    timePresetCompleteSuffix: "(הושלם)",
    timeMinShort: "{n} דק'",
    timeHourShort: "{h} ש'",
    timeHourMinShort: "{h} ש' {m} דק'",
    closeMenu: "סגור תפריט",
  },
} as const;

export type TranslationKey = keyof typeof translations.en;

export function t(locale: Locale, key: TranslationKey): string {
  return translations[locale][key];
}

export function getGreeting(locale: Locale): string {
  const hour = new Date().getHours();
  if (hour < 12) return t(locale, "goodMorning");
  if (hour < 17) return t(locale, "goodAfternoon");
  return t(locale, "goodEvening");
}
