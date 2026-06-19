export type TaskStatus = "pending" | "in_progress" | "completed" | "archived";
export type BlockStatus = "planned" | "active" | "completed" | "skipped";

export interface MockDailyGoal {
  id: string;
  taskId: string;
  taskTitle: string;
  courseName: string;
  targetMinutes: number;
  /** Action B — "I put in the required hours for today" */
  timeLogged: boolean;
  /** Action A — "The assignment is fully done" (drives the progress bar) */
  isFullyCompleted: boolean;
}

export interface MockMilestone {
  id: string;
  title: string;
  courseName: string;
  dueInDays: number;
  progressPercent: number;
}

export interface MockScheduleBlock {
  id: string;
  startTime: string;
  endTime: string;
  recommendation?: string;
  status: BlockStatus;
}
