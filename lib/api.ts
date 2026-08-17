import axios, {
  AxiosError,
  AxiosInstance,
  AxiosResponse,
  InternalAxiosRequestConfig,
} from "axios";
import { API_BASE_URL } from "@/lib/constants";

export interface ApiEnvelope<T> {
  success: boolean;
  message: string;
  data: T;
}

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface PaginatedResponse<T> {
  items: T[];
  meta: PaginationMeta;
}

export interface AuthUser {
  _id: string;
  name?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  bio?: string;
  profile?: {
    public_id?: string;
    url?: string;
  };
  userId?: string;
  role: "admin" | "teacher" | "student";
  status: "active" | "inactive";
}

export interface LoginData {
  accessToken: string;
  refreshToken: string;
  user: AuthUser;
}

export interface DashboardData {
  counters: {
    totalStudents: number;
    activeStudents: number;
    inactiveStudents: number;
    totalTeachers: number;
    activeTeachers: number;
    inactiveTeachers: number;
    totalSubjects: number;
  };
  charts: {
    subjectDistribution: Array<{
      subject: string;
      completed: number;
    }>;
    monthlyStudentGrowth: Array<{
      month: string;
      total: number;
    }>;
    activityHour: Array<{
      day: string;
      hours: number;
    }>;
  };
}

export interface StudentListItem {
  _id: string;
  studentName: string;
  userId: string;
  schoolName: string;
  schoolId: string;
  gradeLevel: string;
  status: "active" | "inactive";
}

export interface TeacherCourse {
  _id: string;
  name: string;
}

export interface TeacherListItem {
  _id: string;
  teacherName: string;
  userId: string;
  schoolName: string;
  schoolId: string;
  gradeLevel: string;
  status: "active" | "inactive";
  courses: TeacherCourse[];
}

export interface SchoolItem {
  _id: string;
  name: string;
  schoolCode: string;
  schooleCode?: string;
  totalStudent: number;
  totalTeacher: number;
  gradeLevels: string[];
  status: "active" | "inactive";
  createdAt: string;
  updatedAt: string;
}

export interface CourseItem {
  _id: string;
  name: string;
  description?: string;
  gradeLevels: string[];
  status: "active" | "inactive";
  image?: { url?: string; public_id?: string };
}

export interface BulkCreateResult<T> {
  created: T[];
  failed: Array<{
    index: number;
    message: string;
    item?: unknown;
  }>;
}

export interface BulkStudentPayload {
  schoolId?: string;
  schoolName?: string;
  studentName: string;
  userId: string;
  password: string;
  confirmPassword: string;
  gradeLevel: string;
  status?: "active" | "inactive";
}

export interface BulkTeacherPayload {
  schoolId?: string;
  schoolName?: string;
  teacherName: string;
  userId: string;
  password: string;
  confirmPassword: string;
  gradeLevel: string;
  courseIds?: string[];
  status?: "active" | "inactive";
}

export interface BulkSchoolPayload {
  name: string;
  schoolCode: string;
  gradeLevels?: string[];
  status?: "active" | "inactive";
}

export interface StudentDetailsData {
  student: {
    _id: string;
    studentName: string;
    userId: string;
    schoolName: string;
    schoolCode: string;
    gradeLevel: string;
    status: "active" | "inactive";
    picture?: {
      url?: string;
      public_id?: string;
    };
  };
  progressSheet: {
    summary: {
      totalActivities: number;
      completedActivities: number;
      totalHours: number;
      avgQuizScore: number;
      completionRate: number;
    };
    subjectProgress: Array<{
      subject: string;
      completionRate: number;
    }>;
    recentWork: Array<{
      _id: string;
      subject: string;
      lessonTitle: string;
      strand: string;
      subStrand: string;
      activityType: string;
      status: string;
      score: number | null;
      updatedAt: string;
    }>;
    lowestQuizScores: Array<{
      _id: string;
      subject: string;
      score: number | null;
      updatedAt: string;
    }>;
  };
}

export interface TeacherDetailsData {
  _id: string;
  teacherName: string;
  userId: string;
  schoolName: string;
  schoolCode: string;
  gradeLevel: string;
  status: "active" | "inactive";
  picture?: {
    url?: string;
    public_id?: string;
  };
  courses: TeacherCourse[];
}

export interface TeacherOverviewData {
  courses: TeacherCourse[];
  totalStudents: number;
  monthlyTrend: Array<{
    month: string;
    completed: number;
    avgQuizScore: number;
  }>;
  performanceRange: Array<{
    courseId: string;
    subject: string;
    completionRate: number;
  }>;
  recentWork: Array<{
    subject: string;
    practiceCompleted: number;
    practiceTotal: number;
    quizCompleted: number;
    quizTotal: number;
    lowestQuizScore: number | null;
  }>;
}

interface AuthBridge {
  getAccessToken: () => string | undefined;
  getRefreshToken: () => string | undefined;
  onAccessToken: (accessToken: string) => Promise<void> | void;
  onUnauthorized: () => void;
}

interface RetryConfig extends InternalAxiosRequestConfig {
  __isRetryRequest?: boolean;
}

type FilterValue = string | number | boolean | null | undefined;
const BULK_CHUNK_SIZE = 25;
const BULK_REQUEST_TIMEOUT_MS = 120000;

let authBridge: AuthBridge = {
  getAccessToken: () => undefined,
  getRefreshToken: () => undefined,
  onAccessToken: () => undefined,
  onUnauthorized: () => undefined,
};

let refreshPromise: Promise<string | null> | null = null;

const createAxiosInstance = (): AxiosInstance =>
  axios.create({
    baseURL: API_BASE_URL,
    timeout: 20000,
    withCredentials: false,
  });

const apiClient = createAxiosInstance();
const publicClient = createAxiosInstance();

const unwrap = <T>(response: AxiosResponse<ApiEnvelope<T>>) => response.data.data;

const compactParams = (params?: Record<string, FilterValue>) =>
  Object.fromEntries(
    Object.entries(params || {}).filter(
      ([, value]) => value !== undefined && value !== null && value !== "",
    ),
  );

const chunkItems = <T>(items: T[], size: number) => {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
};

const createBulkRecords = async <TPayload, TResult>(
  path: string,
  key: string,
  items: TPayload[],
): Promise<BulkCreateResult<TResult>> => {
  const created: TResult[] = [];
  const failed: BulkCreateResult<TResult>["failed"] = [];

  for (const chunk of chunkItems(items, BULK_CHUNK_SIZE)) {
    const offset = created.length + failed.length;
    const response = await apiClient.post<ApiEnvelope<BulkCreateResult<TResult>>>(
      path,
      { [key]: chunk },
      { timeout: BULK_REQUEST_TIMEOUT_MS },
    );
    const result = unwrap(response);
    created.push(...result.created);
    failed.push(
      ...result.failed.map((item) => ({
        ...item,
        index: item.index + offset,
      })),
    );
  }

  return { created, failed };
};

const requestAccessTokenRefresh = async (): Promise<string | null> => {
  const refreshToken = authBridge.getRefreshToken();
  if (!refreshToken) return null;

  try {
    const response = await publicClient.post<
      ApiEnvelope<{ accessToken: string }>
    >("/auth/refresh-token", {
      refreshToken,
    });
    const accessToken = response.data.data?.accessToken;
    if (!accessToken) return null;
    await authBridge.onAccessToken(accessToken);
    return accessToken;
  } catch {
    return null;
  }
};

apiClient.interceptors.request.use((config) => {
  const token = authBridge.getAccessToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const status = error.response?.status;
    const originalRequest = error.config as RetryConfig | undefined;

    if (status !== 401 || !originalRequest || originalRequest.__isRetryRequest) {
      return Promise.reject(error);
    }

    originalRequest.__isRetryRequest = true;

    if (!refreshPromise) {
      refreshPromise = requestAccessTokenRefresh().finally(() => {
        refreshPromise = null;
      });
    }

    const nextToken = await refreshPromise;
    if (!nextToken) {
      authBridge.onUnauthorized();
      return Promise.reject(error);
    }

    originalRequest.headers.Authorization = `Bearer ${nextToken}`;
    return apiClient(originalRequest);
  },
);

export const configureApiAuthBridge = (bridge: Partial<AuthBridge>) => {
  authBridge = {
    ...authBridge,
    ...bridge,
  };
};

export const getApiErrorMessage = (
  error: unknown,
  fallback = "Something went wrong",
) => {
  if (axios.isAxiosError(error)) {
    const message =
      (error.response?.data as { message?: string } | undefined)?.message ||
      error.message;
    return message || fallback;
  }

  if (error instanceof Error) {
    return error.message || fallback;
  }

  return fallback;
};

export const loginAdmin = async (payload: {
  email: string;
  password: string;
}) => {
  const response = await publicClient.post<ApiEnvelope<LoginData>>(
    "/auth/login",
    payload,
  );
  return response.data;
};

export const forgotPassword = async (payload: { email: string }) => {
  const response = await publicClient.post<ApiEnvelope<null>>(
    "/auth/forgot-password",
    payload,
  );
  return response.data;
};

export const verifyOtp = async (payload: { email: string; otp: string }) => {
  const response = await publicClient.post<ApiEnvelope<null>>(
    "/auth/verify-otp",
    payload,
  );
  return response.data;
};

export const resetPassword = async (payload: {
  email: string;
  otp?: string;
  password?: string;
  newPassword?: string;
  confirmPassword?: string;
}) => {
  const preferredPassword = payload.newPassword || payload.password || "";
  const confirmPassword = payload.confirmPassword || preferredPassword;

  const response = await publicClient.post<ApiEnvelope<null>>(
    "/auth/reset-password",
    {
      email: payload.email,
      otp: payload.otp,
      newPassword: preferredPassword,
      confirmPassword,
      password: preferredPassword,
    },
  );

  return response.data;
};

export const logoutAdmin = async (payload?: { refreshToken?: string }) => {
  const response = await publicClient.post<ApiEnvelope<null>>("/auth/logout", {
    refreshToken: payload?.refreshToken,
  });
  return response.data;
};

export const refreshAccessToken = async (payload: { refreshToken: string }) => {
  const response = await publicClient.post<
    ApiEnvelope<{ accessToken: string }>
  >("/auth/refresh-token", payload);
  return response.data;
};

export const fetchDashboard = async () => {
  const response = await apiClient.get<ApiEnvelope<DashboardData>>(
    "/admin/dashboard",
  );
  return unwrap(response);
};

export const fetchStudents = async (params: {
  page?: number;
  limit?: number;
  search?: string;
  schoolId?: string;
  gradeLevel?: string;
  status?: string;
}) => {
  const response = await apiClient.get<ApiEnvelope<PaginatedResponse<StudentListItem>>>(
    "/admin/students",
    {
      params: compactParams(params),
    },
  );
  return unwrap(response);
};

export const fetchStudentById = async (studentId: string) => {
  const response = await apiClient.get<ApiEnvelope<StudentDetailsData>>(
    `/admin/students/${studentId}`,
  );
  return unwrap(response);
};

export const createStudent = async (payload: FormData) => {
  const response = await apiClient.post<ApiEnvelope<StudentListItem>>(
    "/admin/students",
    payload,
    {
      headers: {
        "Content-Type": "multipart/form-data",
      },
    },
  );
  return unwrap(response);
};

export const createStudentsBulk = async (students: BulkStudentPayload[]) => {
  return createBulkRecords<BulkStudentPayload, StudentListItem>(
    "/admin/students/bulk",
    "students",
    students,
  );
};

export const updateStudent = async (studentId: string, payload: FormData) => {
  const response = await apiClient.patch<ApiEnvelope<StudentListItem>>(
    `/admin/students/${studentId}`,
    payload,
    {
      headers: {
        "Content-Type": "multipart/form-data",
      },
    },
  );
  return unwrap(response);
};

export const deleteStudent = async (studentId: string) => {
  const response = await apiClient.delete<ApiEnvelope<null>>(
    `/admin/students/${studentId}`,
  );
  return response.data;
};

export const fetchTeachers = async (params: {
  page?: number;
  limit?: number;
  search?: string;
  schoolId?: string;
  gradeLevel?: string;
  status?: string;
}) => {
  const response = await apiClient.get<ApiEnvelope<PaginatedResponse<TeacherListItem>>>(
    "/admin/teachers",
    {
      params: compactParams(params),
    },
  );
  return unwrap(response);
};

export const fetchTeacherById = async (teacherId: string) => {
  const response = await apiClient.get<ApiEnvelope<TeacherDetailsData>>(
    `/admin/teachers/${teacherId}`,
  );
  return unwrap(response);
};

export const fetchTeacherOverview = async (teacherId: string, subject?: string) => {
  const response = await apiClient.get<ApiEnvelope<TeacherOverviewData>>(
    `/admin/teachers/${teacherId}/overview`,
    {
      params: compactParams({ subject }),
    },
  );
  return unwrap(response);
};

export const createTeacher = async (payload: FormData) => {
  const response = await apiClient.post<ApiEnvelope<TeacherListItem>>(
    "/admin/teachers",
    payload,
    {
      headers: {
        "Content-Type": "multipart/form-data",
      },
    },
  );
  return unwrap(response);
};

export const createTeachersBulk = async (teachers: BulkTeacherPayload[]) => {
  return createBulkRecords<BulkTeacherPayload, TeacherListItem>(
    "/admin/teachers/bulk",
    "teachers",
    teachers,
  );
};

export const updateTeacher = async (teacherId: string, payload: FormData) => {
  const response = await apiClient.patch<ApiEnvelope<TeacherListItem>>(
    `/admin/teachers/${teacherId}`,
    payload,
    {
      headers: {
        "Content-Type": "multipart/form-data",
      },
    },
  );
  return unwrap(response);
};

export const deleteTeacher = async (teacherId: string) => {
  const response = await apiClient.delete<ApiEnvelope<null>>(
    `/admin/teachers/${teacherId}`,
  );
  return response.data;
};

export const fetchSchools = async (params: {
  page?: number;
  limit?: number;
  search?: string;
  status?: string;
}) => {
  const response = await apiClient.get<ApiEnvelope<PaginatedResponse<SchoolItem>>>(
    "/admin/schools",
    {
      params: compactParams(params),
    },
  );
  return unwrap(response);
};

export const createSchool = async (payload: {
  name: string;
  schoolCode: string;
  gradeLevels?: string[];
  status?: string;
}) => {
  const response = await apiClient.post<ApiEnvelope<SchoolItem>>(
    "/admin/schools",
    payload,
  );
  return unwrap(response);
};

export const createSchoolsBulk = async (schools: BulkSchoolPayload[]) => {
  return createBulkRecords<BulkSchoolPayload, SchoolItem>(
    "/admin/schools/bulk",
    "schools",
    schools,
  );
};

export const updateSchool = async (
  schoolId: string,
  payload: {
    name?: string;
    schoolCode?: string;
    gradeLevels?: string[];
    status?: string;
  },
) => {
  const response = await apiClient.patch<ApiEnvelope<SchoolItem>>(
    `/admin/schools/${schoolId}`,
    payload,
  );
  return unwrap(response);
};

export const deleteSchool = async (schoolId: string) => {
  const response = await apiClient.delete<ApiEnvelope<null>>(
    `/admin/schools/${schoolId}`,
  );
  return response.data;
};

export const fetchCourses = async (params?: {
  search?: string;
  status?: string;
  gradeLevel?: string;
}) => {
  const response = await apiClient.get<ApiEnvelope<CourseItem[]>>(
    "/admin/courses",
    {
      params: compactParams(params),
    },
  );
  return unwrap(response);
};

export const fetchAdminProfile = async () => {
  const response = await apiClient.get<ApiEnvelope<AuthUser>>("/admin/profile");
  return unwrap(response);
};

export const updateAdminProfile = async (payload: FormData) => {
  const response = await apiClient.patch<ApiEnvelope<AuthUser>>(
    "/admin/profile",
    payload,
    {
      headers: {
        "Content-Type": "multipart/form-data",
      },
    },
  );
  return unwrap(response);
};

export const changeAdminPassword = async (payload: {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}) => {
  const response = await apiClient.patch<ApiEnvelope<null>>(
    "/admin/change-password",
    payload,
  );
  return response.data;
};
