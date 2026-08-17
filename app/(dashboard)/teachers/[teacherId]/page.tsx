"use client";

import Image from "next/image";
import Link from "next/link";
import { useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  Calculator,
  FlaskConical,
  HandHelping,
  KeyRound,
  Landmark,
  Languages,
  Loader2,
  Pencil,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import {
  fetchCourses,
  fetchTeacherById,
  fetchTeacherOverview,
  getApiErrorMessage,
  updateTeacher,
} from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/ui/password-input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type SubjectStyle = {
  label: string;
  bg: string;
  border: string;
  text: string;
  icon: LucideIcon;
};

type SubjectTile = SubjectStyle & {
  subject: string;
};

const SUBJECT_STYLES: SubjectStyle[] = [
  {
    label: "English",
    bg: "#e8fbe8",
    border: "#22c55e",
    text: "#1e9f3a",
    icon: Languages,
  },
  {
    label: "Science",
    bg: "#f4ecff",
    border: "#8b5cf6",
    text: "#7c3aed",
    icon: FlaskConical,
  },
  {
    label: "Math",
    bg: "#eaf4ff",
    border: "#3b82f6",
    text: "#2563eb",
    icon: Calculator,
  },
  {
    label: "Social Studies",
    bg: "#fff0de",
    border: "#fb923c",
    text: "#ea580c",
    icon: Landmark,
  },
  {
    label: "Religious & Moral Education",
    bg: "#f8f5e9",
    border: "#d4b61f",
    text: "#a38100",
    icon: HandHelping,
  },
];

const normalizeText = (value: string) =>
  value.trim().toLowerCase().replace(/\s+/g, " ");

const resolveSubjectStyle = (subject: string): SubjectStyle => {
  const normalized = normalizeText(subject);

  if (normalized.includes("english")) return SUBJECT_STYLES[0];
  if (normalized.includes("science")) return SUBJECT_STYLES[1];
  if (normalized.includes("math")) return SUBJECT_STYLES[2];
  if (normalized.includes("social")) return SUBJECT_STYLES[3];
  if (
    normalized.includes("religious") ||
    normalized.includes("moral") ||
    normalized.includes("rme")
  ) {
    return SUBJECT_STYLES[4];
  }

  return SUBJECT_STYLES[0];
};

const getInitials = (value: string) => {
  const names = value
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2);

  if (names.length === 0) return "TR";
  if (names.length === 1) return names[0].slice(0, 2).toUpperCase();
  return `${names[0][0]}${names[1][0]}`.toUpperCase();
};

const buildSubjectTiles = (
  courses: Array<{ _id: string; name: string }>,
): SubjectTile[] =>
  courses.map((course) => {
    const style = resolveSubjectStyle(course.name || "");
    return {
      ...style,
      subject: course.name || style.label,
    };
  });

export default function TeacherDetailsPage() {
  const params = useParams<{ teacherId: string }>();
  const teacherId = params.teacherId;
  const queryClient = useQueryClient();
  const [resetOpen, setResetOpen] = useState(false);
  const [passwordState, setPasswordState] = useState({
    password: "",
    confirmPassword: "",
  });

  const [selectedSubject, setSelectedSubject] = useState<string | null>(null);
  const [courseDialogOpen, setCourseDialogOpen] = useState(false);
  const [selectedCourseIds, setSelectedCourseIds] = useState<string[]>([]);

  const teacherQuery = useQuery({
    queryKey: ["teacher", teacherId],
    queryFn: () => fetchTeacherById(teacherId),
    enabled: !!teacherId,
  });

  const coursesQuery = useQuery({
    queryKey: ["courses", "active"],
    queryFn: () => fetchCourses({ status: "active" }),
    enabled: courseDialogOpen,
  });

  const resetPasswordMutation = useMutation({
    mutationFn: (payload: FormData) => updateTeacher(teacherId, payload),
    onSuccess: () => {
      toast.success("Password reset successfully");
      setResetOpen(false);
      setPasswordState({ password: "", confirmPassword: "" });
      void queryClient.invalidateQueries({ queryKey: ["teacher", teacherId] });
    },
    onError: (error) => toast.error(getApiErrorMessage(error)),
  });

  const assignCoursesMutation = useMutation({
    mutationFn: (payload: FormData) => updateTeacher(teacherId, payload),
    onSuccess: () => {
      toast.success("Assigned courses updated");
      setCourseDialogOpen(false);
      void queryClient.invalidateQueries({ queryKey: ["teacher", teacherId] });
      void queryClient.invalidateQueries({
        queryKey: ["teacher-overview", teacherId],
      });
    },
    onError: (error) => toast.error(getApiErrorMessage(error)),
  });

  const subjectTiles = useMemo(
    () => buildSubjectTiles(teacherQuery.data?.courses || []),
    [teacherQuery.data?.courses],
  );

  const activeSubject = selectedSubject || subjectTiles[0]?.subject || "";

  const overviewQuery = useQuery({
    queryKey: ["teacher-overview", teacherId, activeSubject],
    queryFn: () => fetchTeacherOverview(teacherId, activeSubject),
    enabled: !!teacherId && subjectTiles.length > 0,
  });

  const chartData = useMemo(
    () =>
      (overviewQuery.data?.monthlyTrend || []).map((item) => ({
        month: item.month,
        value: item.completed,
      })),
    [overviewQuery.data],
  );

  const performanceByCourse = useMemo(() => {
    const map = new Map<string, number>();
    for (const item of overviewQuery.data?.performanceRange || []) {
      map.set(normalizeText(item.subject), item.completionRate);
    }
    return map;
  }, [overviewQuery.data]);

  if (teacherQuery.isLoading) return <LoadingState />;

  if (teacherQuery.isError || !teacherQuery.data) {
    return (
      <div className="rounded-xl border border-[#ffd6d6] bg-[#fff5f5] p-6 text-[#d53d3d]">
        {getApiErrorMessage(teacherQuery.error, "Unable to load teacher details")}
      </div>
    );
  }

  const teacher = teacherQuery.data;
  const activeSubjectStyle = subjectTiles.find(
    (item) => item.subject === activeSubject,
  );

  const handleResetPassword = () => {
    if (!passwordState.password || !passwordState.confirmPassword) {
      toast.error("Password and confirm password are required");
      return;
    }

    if (passwordState.password !== passwordState.confirmPassword) {
      toast.error("Passwords do not match");
      return;
    }

    const payload = new FormData();
    payload.append("password", passwordState.password);
    resetPasswordMutation.mutate(payload);
  };

  const handleOpenCourseDialog = () => {
    setSelectedCourseIds(teacher.courses.map((course) => course._id));
    setCourseDialogOpen(true);
  };

  const handleToggleCourse = (courseId: string) => {
    setSelectedCourseIds((prev) =>
      prev.includes(courseId)
        ? prev.filter((id) => id !== courseId)
        : [...prev, courseId],
    );
  };

  const handleSaveCourses = () => {
    const payload = new FormData();
    payload.append("courseIds", JSON.stringify(selectedCourseIds));
    assignCoursesMutation.mutate(payload);
  };

  return (
    <div className="space-y-4">
      <Card className="content-shell">
        <CardContent className="p-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h1 className="text-[24px] font-semibold">Teacher Details</h1>
              <p className="mt-1 text-[16px] text-[#838383]">
                <Link href="/teachers" className="hover:underline">
                  Teacher Management
                </Link>{" "}
                &gt; Teacher Details
              </p>
            </div>
            <Button
              type="button"
              variant="secondary"
              onClick={() => setResetOpen(true)}
              className="gap-2"
            >
              <KeyRound className="h-4 w-4" />
              Reset Password
            </Button>
          </div>

          <div className="mt-4 rounded-xl border border-[#e2e7db] p-5">
            <p className="text-[20px] font-semibold text-[#1f1f1f]">
              School name:{" "}
              <span className="text-[#129b33]">{teacher.schoolName}</span>
            </p>
            <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-center">
              <div className="relative h-20 w-20 overflow-hidden rounded-full border border-[#deead8] bg-[#d9e8d2]">
                {teacher.picture?.url ? (
                  <Image
                    src={teacher.picture.url}
                    alt={teacher.teacherName}
                    fill
                    className="object-cover"
                  />
                ) : (
                  <span className="flex h-full w-full items-center justify-center text-xl font-semibold text-[#2d5f2f]">
                    {getInitials(teacher.teacherName)}
                  </span>
                )}
              </div>
              <div>
                <h2 className="text-[24px] font-semibold">{teacher.teacherName}</h2>
                <p className="text-[14px] text-[#666]">User ID: {teacher.userId}</p>
                <p className="text-[14px] text-[#666]">Password: ********</p>
                <p className="text-[14px] text-[#666]">
                  Grade Level: {teacher.gradeLevel}
                </p>
              </div>
            </div>
          </div>

          <div className="mt-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-[20px] font-semibold text-[#272727]">
                  Assign course
                </h3>
                <p className="text-[13px] text-[#8f8f8f]">
                  Assigned subjects for the teacher — select a tile to view its progress
                </p>
              </div>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={handleOpenCourseDialog}
                className="gap-2"
              >
                <Pencil className="h-4 w-4" />
                Edit
              </Button>
            </div>
            <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              {subjectTiles.map((subject) => {
                const Icon = subject.icon;
                const isSelected = subject.subject === activeSubject;
                return (
                  <button
                    key={subject.subject}
                    type="button"
                    onClick={() => setSelectedSubject(subject.subject)}
                    className="rounded-xl border p-4 text-center transition-shadow"
                    style={{
                      backgroundColor: subject.bg,
                      borderColor: isSelected ? subject.border : "#e2e7db",
                    }}
                  >
                    <div className="mx-auto mb-2 flex h-11 w-11 items-center justify-center rounded-full bg-white/60">
                      <Icon className="h-6 w-6" style={{ color: subject.text }} />
                    </div>
                    <p className="text-[13px] font-semibold" style={{ color: subject.text }}>
                      {subject.subject}
                    </p>
                  </button>
                );
              })}
              {subjectTiles.length === 0 && (
                <p className="text-[13px] text-[#8f8f8f]">
                  No subjects assigned yet. Click Edit to assign courses.
                </p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <Dialog open={courseDialogOpen} onOpenChange={setCourseDialogOpen}>
        <DialogContent className="max-w-[480px]">
          <DialogHeader>
            <DialogTitle className="text-[24px]">Assign Courses</DialogTitle>
            <DialogDescription>
              Select the subjects {teacher.teacherName} will teach. Multiple
              subjects can be selected.
            </DialogDescription>
          </DialogHeader>

          <div className="thin-scrollbar grid max-h-[260px] gap-2 overflow-y-auto pr-2">
            {coursesQuery.isLoading && (
              <p className="text-sm text-[#8f8f8f]">Loading courses…</p>
            )}
            {coursesQuery.isError && (
              <p className="text-sm text-[#d53d3d]">
                {getApiErrorMessage(coursesQuery.error, "Unable to load courses")}
              </p>
            )}
            {(coursesQuery.data || []).map((course) => (
              <label
                key={course._id}
                className="flex cursor-pointer items-center gap-3 rounded-lg border border-[#e2e7db] p-3 text-sm"
              >
                <input
                  type="checkbox"
                  className="h-4 w-4"
                  checked={selectedCourseIds.includes(course._id)}
                  onChange={() => handleToggleCourse(course._id)}
                />
                {course.name}
              </label>
            ))}
            {coursesQuery.isSuccess && coursesQuery.data.length === 0 && (
              <p className="text-sm text-[#8f8f8f]">No active courses available.</p>
            )}
          </div>

          <DialogFooter className="grid grid-cols-2 gap-3 sm:grid-cols-2">
            <Button variant="secondary" onClick={() => setCourseDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleSaveCourses}
              disabled={assignCoursesMutation.isPending}
            >
              {assignCoursesMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                "Save"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={resetOpen}
        onOpenChange={(open) => {
          setResetOpen(open);
          if (!open) {
            setPasswordState({ password: "", confirmPassword: "" });
          }
        }}
      >
        <DialogContent className="max-w-[560px]">
          <DialogHeader>
            <DialogTitle className="text-[24px]">Reset Password</DialogTitle>
            <DialogDescription>
              Set a new password for {teacher.teacherName}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4">
            <div className="space-y-2">
              <Label>New Password</Label>
              <PasswordInput
                value={passwordState.password}
                onChange={(event) =>
                  setPasswordState((prev) => ({
                    ...prev,
                    password: event.target.value,
                  }))
                }
                placeholder="Enter new password"
              />
            </div>
            <div className="space-y-2">
              <Label>Confirm Password</Label>
              <PasswordInput
                value={passwordState.confirmPassword}
                onChange={(event) =>
                  setPasswordState((prev) => ({
                    ...prev,
                    confirmPassword: event.target.value,
                  }))
                }
                placeholder="Confirm new password"
              />
            </div>
          </div>

          <DialogFooter className="grid grid-cols-2 gap-3 sm:grid-cols-2">
            <Button variant="secondary" onClick={() => setResetOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleResetPassword}
              disabled={resetPasswordMutation.isPending}
            >
              {resetPasswordMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                "Save"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Card className="content-shell">
        <CardContent className="p-5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-[24px] font-semibold leading-none">
              Subject completion Overview
            </h2>
            <select
              className="rounded-md bg-[linear-gradient(180deg,#00B023_0%,#077A1E_91.46%)] px-3 py-1 text-sm text-white outline-none"
              value={activeSubject}
              onChange={(event) => setSelectedSubject(event.target.value)}
              disabled={subjectTiles.length === 0}
            >
              {subjectTiles.map((subject) => (
                <option key={subject.subject} value={subject.subject}>
                  {subject.subject}
                </option>
              ))}
            </select>
          </div>

          <div className="h-[380px] rounded-xl border border-[#dce8d5] bg-[#f4fdf2] p-3">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="teacherOverview" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#39b54a" stopOpacity={0.75} />
                    <stop offset="100%" stopColor="#39b54a" stopOpacity={0.15} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="4 4" stroke="#cfe1c8" />
                <XAxis dataKey="month" tickLine={false} />
                <YAxis tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip />
                <Area
                  type="monotone"
                  dataKey="value"
                  name="Activities completed"
                  stroke="#0b9f2f"
                  strokeWidth={3}
                  fill="url(#teacherOverview)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          <p className="mt-3 text-sm text-[#6f6f6f]">
            Active Subject:{" "}
            <span
              className="font-semibold"
              style={{ color: activeSubjectStyle?.text }}
            >
              {activeSubject || "—"}
            </span>
          </p>
        </CardContent>
      </Card>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card className="content-shell">
          <CardContent className="p-5">
            <h3 className="text-[24px] font-semibold">Performance Range</h3>
            <div className="mt-4 space-y-4">
              {subjectTiles.map((subject) => {
                const completionRate =
                  performanceByCourse.get(normalizeText(subject.subject)) || 0;
                return (
                  <div key={subject.subject}>
                    <div className="mb-1 flex items-center justify-between text-[13px]">
                      <span>{subject.subject}</span>
                      <span className="font-semibold">{completionRate}%</span>
                    </div>
                    <div className="h-2 rounded-full bg-[#edf2e7]">
                      <div
                        className="h-2 rounded-full"
                        style={{
                          width: `${completionRate}%`,
                          backgroundColor: subject.border,
                        }}
                      />
                    </div>
                  </div>
                );
              })}
              {subjectTiles.length === 0 && (
                <p className="text-[13px] text-[#8f8f8f]">
                  No subjects assigned yet.
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="content-shell">
          <CardContent className="p-5">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-[24px] font-semibold leading-none">Recent Work</h3>
              <select className="rounded-md border border-[#d7ddce] bg-white px-2 py-1 text-sm text-[#555] outline-none">
                <option>Today</option>
                <option>Weekly</option>
                <option>Monthly</option>
              </select>
            </div>
            <p className="mb-3 text-[13px] text-[#8f8f8f]">
              Recent lesson activity and completion summary
            </p>
            <div className="rounded-lg border border-[#e8ece0]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Subject</TableHead>
                    <TableHead>Practice</TableHead>
                    <TableHead>Quiz</TableHead>
                    <TableHead>Lowest Quiz Score</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {subjectTiles.map((subject) => {
                    const work = overviewQuery.data?.recentWork.find(
                      (item) => normalizeText(item.subject) === normalizeText(subject.subject),
                    );
                    const practice = work
                      ? `${work.practiceCompleted}/${work.practiceTotal}`
                      : "—";
                    const quiz = work
                      ? `${work.quizCompleted}/${work.quizTotal}`
                      : "—";
                    const lowest =
                      work?.lowestQuizScore != null ? `${work.lowestQuizScore}%` : "—";

                    return (
                      <TableRow key={subject.subject}>
                        <TableCell style={{ color: subject.text }}>
                          {subject.subject}
                        </TableCell>
                        <TableCell>{practice}</TableCell>
                        <TableCell>{quiz}</TableCell>
                        <TableCell>{lowest}</TableCell>
                      </TableRow>
                    );
                  })}
                  {subjectTiles.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center text-[#8f8f8f]">
                        No subjects assigned yet.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function LoadingState() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-72 rounded-xl" />
      <Skeleton className="h-96 rounded-xl" />
      <div className="grid gap-4 xl:grid-cols-2">
        <Skeleton className="h-72 rounded-xl" />
        <Skeleton className="h-72 rounded-xl" />
      </div>
    </div>
  );
}
