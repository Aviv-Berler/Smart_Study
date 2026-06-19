import type {
  MockDailyGoal,
  MockMilestone,
  MockScheduleBlock,
} from "@/types/study";

export const MOCK_MILESTONES: MockMilestone[] = [
  {
    id: "milestone-1",
    title: "Midterm Exam",
    courseName: "Calculus 2",
    dueInDays: 5,
    progressPercent: 42,
  },
  {
    id: "milestone-2",
    title: "Final Project",
    courseName: "Data Structures",
    dueInDays: 10,
    progressPercent: 18,
  },
];

export const MOCK_DAILY_GOALS: MockDailyGoal[] = [
  {
    id: "goal-1",
    taskId: "task-1",
    taskTitle: "Problem Set 4",
    courseName: "Calculus 2",
    targetMinutes: 180,
    timeLogged: false,
    isFullyCompleted: false,
  },
  {
    id: "goal-2",
    taskId: "task-2",
    taskTitle: "Implement Hash Table",
    courseName: "Data Structures",
    targetMinutes: 120,
    timeLogged: false,
    isFullyCompleted: false,
  },
  {
    id: "goal-3",
    taskId: "task-3",
    taskTitle: "Read Chapter 5",
    courseName: "Intro to Data Science",
    targetMinutes: 90,
    timeLogged: false,
    isFullyCompleted: false,
  },
];

export const MOCK_SCHEDULE_BLOCKS: MockScheduleBlock[] = [
  {
    id: "block-1",
    startTime: "09:00",
    endTime: "11:00",
    recommendation: "Data Structures — Implement Hash Table",
    status: "active",
  },
  {
    id: "block-2",
    startTime: "11:30",
    endTime: "13:00",
    recommendation: "Intro to Data Science — Read Chapter 5",
    status: "planned",
  },
  {
    id: "block-3",
    startTime: "14:00",
    endTime: "17:00",
    recommendation: "Calculus 2 — Problem Set 4",
    status: "planned",
  },
];
