"use client";

import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  MapPin,
  Clock,
  ShieldCheck,
  History,
  Loader2,
  Navigation,
  Briefcase,
  Home,
  CheckCircle,
  AlertTriangle,
  Calendar,
  CalendarDays,
  User,
  Filter,
  RefreshCw,
  Wifi,
  WifiOff,
} from "lucide-react";
import { cn, formatDate, getWorkingHoursColor, formatHoursToHHMM, parseDateTime, isEmployeeActiveOnDate, calculateWorkingHoursHHMM } from "@/lib/utils";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell
} from "@/components/ui/table";
import { Plant, Employee } from "@/lib/types";
import { useData } from "@/context/data-context";
import {
  format,
  parseISO,
  addHours,
  addMinutes,
  isAfter,
  isValid,
  startOfMonth,
  endOfMonth,
  addDays,
  isSunday,
  isSameMonth,
  subMonths,
  differenceInMinutes,
  differenceInCalendarDays,
  isBefore,
  startOfToday,
  startOfDay,
  differenceInCalendarMonths
} from "date-fns";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
  DialogDescription
} from "@/components/ui/dialog";
import { RadioGroup } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getTranslation } from "@/lib/translations";

const getISTTime = () => {
  return new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
};

const formatToReadableISTTime = (rawTime: any): string => {
  if (!rawTime) return format(getISTTime(), "hh:mm a");
  const str = String(rawTime).trim();
  if (!str) return format(getISTTime(), "hh:mm a");

  // Case 1: Time string only e.g. "14:34" or "09:04" or "02:34 PM" or "9:04:00 AM"
  if (/^\d{1,2}:\d{2}(:\d{2})?\s*(AM|PM)?$/i.test(str)) {
    const match = str.match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM)?$/i);
    if (match) {
      let h = parseInt(match[1], 10);
      const m = match[2];
      const ampmSpec = match[3]?.toUpperCase();
      if (ampmSpec) {
        return `${String(h).padStart(2, '0')}:${m} ${ampmSpec}`;
      }
      const ampm = h >= 12 ? 'PM' : 'AM';
      const h12 = h % 12 || 12;
      return `${String(h12).padStart(2, '0')}:${m} ${ampm}`;
    }
  }

  // Case 2: Date + Time string without explicit timezone offset (e.g. "2026-09-01 09:04:00" or "2026-09-01T09:04:00")
  // Extract local time directly without false UTC+5:30 double shifts
  const dtMatch = str.match(/^\d{4}-\d{2}-\d{2}[ T](\d{1,2}):(\d{2})(?::\d{2})?(?:\s*(AM|PM))?$/i);
  if (dtMatch) {
    let h = parseInt(dtMatch[1], 10);
    const m = dtMatch[2];
    const ampmSpec = dtMatch[3]?.toUpperCase();
    if (ampmSpec) {
      return `${String(h).padStart(2, '0')}:${m} ${ampmSpec}`;
    }
    const ampm = h >= 12 ? 'PM' : 'AM';
    const h12 = h % 12 || 12;
    return `${String(h12).padStart(2, '0')}:${m} ${ampm}`;
  }

  // Case 3: ISO string with explicit Z or +/- timezone offset (convert UTC to IST)
  try {
    const parsed = new Date(str);
    if (!isNaN(parsed.getTime())) {
      return new Intl.DateTimeFormat('en-US', {
        timeZone: 'Asia/Kolkata',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
      }).format(parsed);
    }
  } catch (e) { }

  return str;
};

const getPreciseDistance = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
    Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLon / 2) *
    Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

// Ordinal suffix helper: 1 -> "1st", 2 -> "2nd", 3 -> "3rd", 4 -> "4th", 11 -> "11th", 21 -> "21st"
const toOrdinal = (n: number): string => {
  const abs = Math.abs(n);
  const mod100 = abs % 100;
  const mod10 = abs % 10;
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`;
  if (mod10 === 1) return `${n}st`;
  if (mod10 === 2) return `${n}nd`;
  if (mod10 === 3) return `${n}rd`;
  return `${n}th`;
};

// --- LEAVE REQUEST FORM COMPONENT (FOR EMPLOYEES) ---
function LeaveRequestForm({ t }: { t?: any }) {
  const [open, setOpen] = useState(false);
  const { addRecord, verifiedUser, currentUser, leaveRequests, refreshData } = useData();
  const { toast } = useToast();
  const [purpose, setPurpose] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [remark, setRemark] = useState("");

  const employeeLang = (verifiedUser?.language || currentUser?.language || 'en').toLowerCase().trim();
  const activeT = t || getTranslation(employeeLang);

  const todayStr = format(startOfToday(), "yyyy-MM-dd");

  const recommendedLeaves = employeeLang === 'hi'
    ? ["बीमारी की छुट्टी", "आकस्मिक अवकाश", "अर्जित अवकाश", "आपातकालीन अवकाश", "विशेषाधिकार अवकाश"]
    : ["Sick Leave", "Casual Leave", "Earned Leave", "Emergency Leave", "Privilege Leave"];

  const totalDays = fromDate && toDate && !isBefore(new Date(toDate), new Date(fromDate))
    ? differenceInCalendarDays(new Date(toDate), new Date(fromDate)) + 1
    : 0;

  const handleRemarkChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const words = e.target.value.split(/\s+/).filter(Boolean);
    if (words.length <= 20) {
      setRemark(e.target.value);
    } else {
      toast({
        variant: "destructive",
        title: employeeLang === 'hi' ? "शब्द सीमा समाप्त" : "Word Limit Exceeded",
        description: employeeLang === 'hi' ? "टिप्पणी 20 शब्दों से अधिक नहीं हो सकती।" : "Remark cannot exceed 20 words.",
      });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const today = startOfToday();

    if (!purpose || !fromDate || !toDate) {
      toast({
        variant: "destructive",
        title: employeeLang === 'hi' ? "अपूर्ण फॉर्म" : "Incomplete Form",
        description: employeeLang === 'hi' ? "कृपया सभी आवश्यक फ़ील्ड भरें।" : "Please fill all required fields."
      });
      return;
    }

    const selectedFromDate = startOfDay(new Date(fromDate));
    const selectedToDate = startOfDay(new Date(toDate));

    if (isBefore(selectedFromDate, today)) {
      toast({
        variant: "destructive",
        title: employeeLang === 'hi' ? "अमान्य दिनांक" : "Invalid Date",
        description: employeeLang === 'hi' ? "पिछली तिथि के लिए अवकाश की अनुमति नहीं है। कृपया आज या भविष्य की तिथि चुनें।" : "Leave request for past dates is not allowed. Please choose today or a future date."
      });
      return;
    }

    if (isBefore(selectedToDate, selectedFromDate)) {
      toast({
        variant: "destructive",
        title: employeeLang === 'hi' ? "अमान्य दिनांक सीमा" : "Invalid Date Range",
        description: employeeLang === 'hi' ? "अंतिम दिनांक प्रारंभ दिनांक से पहले नहीं हो सकती।" : "To Date cannot be before From Date."
      });
      return;
    }

    const empId = verifiedUser?.employeeId || verifiedUser?.username || "N/A";
    const hasDuplicate = (leaveRequests || []).some((req: any) =>
      req.employeeId === empId &&
      String(req.status).toUpperCase() !== 'REJECTED' &&
      (new Date(fromDate) <= new Date(req.toDate) && new Date(toDate) >= new Date(req.fromDate))
    );

    if (hasDuplicate) {
      toast({
        variant: "destructive",
        title: employeeLang === 'hi' ? "डुप्लिकेट अनुरोध" : "Duplicate Request",
        description: employeeLang === 'hi' ? "इन तिथियों के लिए अवकाश अनुरोध पहले से मौजूद है।" : "A leave request for these dates already exists."
      });
      return;
    }

    try {
      await addRecord('leaveRequests', {
        employeeId: empId,
        firmId: verifiedUser?.firmId || "N/A",
        employeeName: verifiedUser?.fullName || "N/A",
        department: verifiedUser?.department || "Operations",
        designation: verifiedUser?.designation || "Staff",
        purpose,
        fromDate,
        toDate,
        days: totalDays,
        remark,
        status: 'UNDER_PROCESS',
        createdAt: new Date().toISOString()
      });
      await refreshData();
      toast({
        title: employeeLang === 'hi' ? "अवकाश अनुरोध जमा हुआ" : "Leave Request Submitted",
        description: employeeLang === 'hi' ? "आपका अनुरोध अनुमोदन के लिए भेज दिया गया है।" : "Your request has been sent for approval."
      });
      setOpen(false);
      setPurpose("");
      setFromDate("");
      setToDate("");
      setRemark("");
    } catch (error) {
      toast({
        variant: "destructive",
        title: employeeLang === 'hi' ? "जमा करने में विफल" : "Submission Failed",
        description: employeeLang === 'hi' ? "आपका अवकाश अनुरोध जमा नहीं हो सका।" : "Could not submit your leave request."
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="bg-slate-900 hover:bg-slate-800 text-white font-black text-xs uppercase tracking-wider rounded-xl py-2 px-4 h-9 flex items-center justify-center gap-2 shadow-sm">
          <CalendarDays className="w-4 h-4" /> {activeT.applyForLeave}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px] rounded-3xl">
        <DialogHeader>
          <DialogTitle className="text-md font-black uppercase tracking-tight text-slate-900">{activeT.newLeaveRequest}</DialogTitle>
          <DialogDescription className="text-xs text-slate-400 uppercase font-semibold">{activeT.fillLeaveDetails}</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 pt-2">
          <div className="space-y-2">
            <Label htmlFor="purpose" className="text-[10px] font-black uppercase text-slate-500 tracking-wider">{activeT.leavePurpose}</Label>
            <Input id="purpose" placeholder={employeeLang === 'hi' ? "उदा. बीमारी की छुट्टी, आकस्मिक अवकाश" : "e.g. Sick Leave, Casual Leave"} value={purpose} onChange={(e) => setPurpose(e.target.value)} className="h-10 border-slate-200 bg-slate-50 rounded-xl text-xs font-bold" required />

            <div className="flex flex-wrap gap-1.5 pt-0.5">
              {recommendedLeaves.map((leaveType) => (
                <Badge
                  key={leaveType}
                  variant="secondary"
                  className={cn(
                    "cursor-pointer text-[10px] font-bold uppercase rounded-lg px-2 py-1 transition-all border border-slate-200/60 bg-white text-slate-600 hover:bg-slate-100",
                    purpose === leaveType && "bg-primary text-white border-primary hover:bg-primary/90"
                  )}
                  onClick={() => setPurpose(leaveType)}
                >
                  {leaveType}
                </Badge>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="fromDate" className="text-[10px] font-black uppercase text-slate-500 tracking-wider">{activeT.fromDate}</Label>
              <Input id="fromDate" type="date" min={todayStr} value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="h-10 border-slate-200 bg-slate-50 rounded-xl text-xs font-bold" required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="toDate" className="text-[10px] font-black uppercase text-slate-500 tracking-wider">{activeT.toDate}</Label>
              <Input id="toDate" type="date" min={fromDate || todayStr} value={toDate} onChange={(e) => setToDate(e.target.value)} className="h-10 border-slate-200 bg-slate-50 rounded-xl text-xs font-bold" required />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-[10px] font-black uppercase text-slate-500 tracking-wider">{activeT.totalLeaveDays}</Label>
            <Input value={totalDays > 0 ? `${totalDays} ${activeT.daysUnit}` : ""} placeholder={`0 ${activeT.daysUnit}`} disabled readOnly className="h-10 border-slate-200 bg-slate-100 rounded-xl text-xs font-black text-primary" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="remark" className="text-[10px] font-black uppercase text-slate-500 tracking-wider">{activeT.remarkOptional}</Label>
            <Textarea id="remark" placeholder={employeeLang === 'hi' ? "अतिरिक्त विवरण लिखें..." : "Provide any additional notes..."} value={remark} onChange={handleRemarkChange} className="min-h-[70px] border-slate-200 bg-slate-50 rounded-xl font-medium text-xs" />
          </div>
          <DialogFooter className="flex flex-row gap-3 pt-2">
            <Button variant="ghost" type="button" onClick={() => setOpen(false)} className="flex-1 rounded-xl font-bold h-11 uppercase text-xs">{activeT.cancel}</Button>
            <Button type="submit" className="flex-1 bg-primary hover:bg-primary/90 font-black text-white rounded-xl h-11 uppercase text-xs">{activeT.submitRequest}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function AttendancePage() {
  const {
    attendanceRecords = [],
    addRecord,
    updateRecord,
    upsertAttendanceRecord,
    refreshData,
    plants = [],
    verifiedUser,
    currentUser,
    isLoading,
    holidays = [],
    employees = [],
    leaveRequests = [],
  } = useData();

  // Determine if logged-in user is an Employee or Admin/Other User
  const isEmployeeLogin = useMemo(() => {
    if (!verifiedUser && !currentUser) return false;
    const roleStr = String(verifiedUser?.role || currentUser?.role || '').toUpperCase();
    if (roleStr === 'EMPLOYEE') return true;
    if (Array.isArray(verifiedUser?.role) && verifiedUser.role.map((r: any) => String(r).toUpperCase()).includes('EMPLOYEE')) return true;
    if (verifiedUser?.employeeId && !['SUPER_ADMIN', 'ADMIN', 'HR', 'USER'].includes(roleStr)) return true;
    return false;
  }, [verifiedUser, currentUser]);

  const employeeLang = (verifiedUser?.language || currentUser?.language || 'en').toLowerCase().trim();
  const t = useMemo(() => getTranslation(employeeLang), [employeeLang]);

  const [isMutatingAttendance, setIsMutatingAttendance] = useState(false);
  const [currentTime, setCurrentTime] = useState<Date | null>(null);
  const [isMounted, setIsMounted] = useState(false);
  const [isOnline, setIsOnline] = useState<boolean>(() => {
    return typeof navigator !== 'undefined' ? navigator.onLine : true;
  });

  // Monthly competition ranks fetched server-side (keyed by monthKey e.g. "2026-09")
  const [monthlyRanks, setMonthlyRanks] = useState<Record<string, number>>({});

  // Internet Connectivity & Auto-Refresh / Status Synchronization (Requirements 1 & 12)
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleOnline = () => {
      setIsOnline(true);
      refreshData().catch(() => {});
    };
    const handleOffline = () => {
      setIsOnline(false);
    };

    setIsOnline(navigator.onLine);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        setCurrentTime(getISTTime());
        setIsOnline(navigator.onLine);
        refreshData().catch(() => {});
      }
    };
    const handleWindowFocus = () => {
      setCurrentTime(getISTTime());
      setIsOnline(navigator.onLine);
      refreshData().catch(() => {});
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleWindowFocus);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleWindowFocus);
    };
  }, [refreshData]);

  const [isLoadingLocation, setIsLoadingLocation] = useState(false);
  const [activeDialog, setActiveDialog] = useState<"NONE" | "IN" | "OUT">("NONE");

  // Location Permission & Fast Verification State
  const [locationPermissionStatus, setLocationPermissionStatus] = useState<"checking" | "prompt" | "granted" | "denied" | "unavailable">("checking");
  const [locationPermissionMessage, setLocationPermissionMessage] = useState<string | null>(null);

  const [currentGPS, setCurrentGPS] = useState<{ lat: number, lng: number } | null>(null);
  const [gpsAccuracy, setGpsAccuracy] = useState<number | null>(null);
  const [detectedPlant, setDetectedPlant] = useState<Plant | null>(null);
  const [nearestPlantInfo, setNearestPlantInfo] = useState<{ plant: Plant; distance: number } | null>(null);
  const [detectedAddress, setDetectedAddress] = useState("");
  const [detailedLocation, setDetailedLocation] = useState({ street: "", area: "", city: "", state: "", pincode: "" });
  const [selectedType, setSelectedType] = useState<"FIELD" | "WFH" | "">("");

  // Admin View State
  const [selectedAdminEmployeeId, setSelectedAdminEmployeeId] = useState<string>("");
  const [adminSearchTerm, setAdminSearchTerm] = useState<string>("");
  const [adminFromDate, setAdminFromDate] = useState<string>(() => {
    const now = getISTTime();
    return format(addDays(now, -45), "yyyy-MM-dd");
  });
  const [adminToDate, setAdminToDate] = useState<string>(() => {
    const now = getISTTime();
    return format(now, "yyyy-MM-dd");
  });

  const isAutoTriggering = useRef(false);
  const activeRecordRef = useRef<any>(null);
  const watchIdRef = useRef<number | null>(null);
  const { toast } = useToast();

  const clearActiveWatch = useCallback(() => {
    if (watchIdRef.current !== null && typeof window !== "undefined" && navigator.geolocation) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
  }, []);

  // Location check on mount (only for employee view)
  const checkLocationOnMount = useCallback((isManualRetry = false) => {
    if (typeof window === "undefined" || !navigator.geolocation) {
      setLocationPermissionStatus("unavailable");
      setLocationPermissionMessage(t.locationPermissionRequired);
      return;
    }

    setLocationPermissionStatus("checking");

    const handlePosSuccess = (pos: GeolocationPosition) => {
      const { latitude: lat, longitude: lng, accuracy } = pos.coords;
      setLocationPermissionStatus("granted");
      setLocationPermissionMessage(null);
      setCurrentGPS({ lat, lng });
      setGpsAccuracy(accuracy);

      const sortedAllPlants = (plants || [])
        .map((p) => ({ plant: p, distance: Math.round(getPreciseDistance(lat, lng, p.lat, p.lng)) }))
        .sort((a, b) => a.distance - b.distance);

      if (sortedAllPlants.length > 0) {
        setNearestPlantInfo(sortedAllPlants[0]);
        if (sortedAllPlants[0].distance <= (sortedAllPlants[0].plant.radius || 700)) {
          setDetectedPlant(sortedAllPlants[0].plant);
          // Instant address assignment: plant name + location (0ms, no network wait)
          setDetectedAddress((prev) => prev || (sortedAllPlants[0].plant.name + ((sortedAllPlants[0].plant as any).location ? ` (${(sortedAllPlants[0].plant as any).location})` : "")));
        } else {
          setDetectedPlant(null);
        }
      } else {
        setNearestPlantInfo(null);
        setDetectedPlant(null);
      }

      // Fast background reverse geocoding (non-blocking)
      fetch('/api/geocode/reverse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lat, lng })
      }).then(res => res.ok ? res.json() : null)
        .then(data => {
          if (data?.address) {
            const addr = typeof data.address === 'object' ? (data.address.Match_addr || data.address.LongLabel || data.address.Address || "") : data.address;
            if (addr) setDetectedAddress(addr);
          }
          if (data?.components) {
            setDetailedLocation({
              street: data.components.street || '',
              area: data.components.area || '',
              city: data.components.city || '',
              state: data.components.state || '',
              pincode: data.components.pincode || ''
            });
          }
        }).catch(() => { });
    };

    navigator.geolocation.getCurrentPosition(
      handlePosSuccess,
      (err) => {
        setLocationPermissionStatus("denied");
        setLocationPermissionMessage(t.locationPermissionRequired);
      },
      { enableHighAccuracy: true, timeout: 5000, maximumAge: 30000 }
    );

    // Warm background listener to keep GPS hot while user is on page
    if (watchIdRef.current === null) {
      try {
        watchIdRef.current = navigator.geolocation.watchPosition(
          handlePosSuccess,
          () => {},
          { enableHighAccuracy: true, timeout: 5000, maximumAge: 30000 }
        );
      } catch (e) {}
    }
  }, [plants, t]);

  useEffect(() => {
    if (isEmployeeLogin) {
      checkLocationOnMount();
    }
  }, [isEmployeeLogin, checkLocationOnMount]);

  useEffect(() => {
    return () => {
      clearActiveWatch();
    };
  }, [clearActiveWatch]);

  useEffect(() => {
    setIsMounted(true);
    setCurrentTime(getISTTime());
    const timer = setInterval(() => setCurrentTime(getISTTime()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Query-param handler: open Mark IN or Mark OUT dialog if action parameter is present
  const searchParams = useSearchParams();
  useEffect(() => {
    if (!isMounted || !isEmployeeLogin) return;
    const action = searchParams?.get("action");
    if (action === "mark_in") {
      const t = setTimeout(() => setActiveDialog("IN"), 100);
      return () => clearTimeout(t);
    } else if (action === "mark_out") {
      const t = setTimeout(() => setActiveDialog("OUT"), 100);
      return () => clearTimeout(t);
    }
  }, [isMounted, isEmployeeLogin, searchParams]);

  // Initialize selected admin employee when employees load
  useEffect(() => {
    if (!isEmployeeLogin && employees.length > 0 && !selectedAdminEmployeeId) {
      const firstEmp = employees[0];
      setSelectedAdminEmployeeId(firstEmp.employeeId || firstEmp.id || (firstEmp as any)._id || "");
    }
  }, [isEmployeeLogin, employees, selectedAdminEmployeeId]);

  // Mark Attendance is strictly employee-specific for the currently logged-in user.
  const effectiveEmployeeId = useMemo(() => {
    if (!verifiedUser) return "N/A";
    return verifiedUser?.employeeId || verifiedUser?.username || "N/A";
  }, [verifiedUser]);

  const effectiveEmployeeName = useMemo(() => {
    if (!verifiedUser) return "N/A";
    return verifiedUser?.fullName || verifiedUser?.name || verifiedUser?.username || "N/A";
  }, [verifiedUser]);

  // Rolling 62-day date bounds based on current date
  const dateWindow62Days = useMemo(() => {
    const now = currentTime || getISTTime();
    const todayStr = format(now, "yyyy-MM-dd");
    const sixtyTwoDaysAgo = addDays(now, -62);
    const startDateStr = format(sixtyTwoDaysAgo, "yyyy-MM-dd");
    return { now, todayStr, sixtyTwoDaysAgo, startDateStr };
  }, [currentTime]);

  // Current Financial Year bounds (1-Apr to 31-Mar)
  const currentFYInfo = useMemo(() => {
    const now = currentTime || getISTTime();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth();
    const fyStartYear = currentMonth < 3 ? currentYear - 1 : currentYear;
    const fyEndYear = fyStartYear + 1;
    const startDateStr = `${fyStartYear}-04-01`;
    const endDateStr = `${fyEndYear}-03-31`;
    const label = `FY ${fyStartYear}-${fyEndYear}`;
    return { fyStartYear, fyEndYear, startDateStr, endDateStr, label };
  }, [currentTime]);

  // All identity synonyms for the currently logged-in user
  const myIdentitySet = useMemo(() => {
    const set = new Set<string>();
    const addClean = (val: any) => {
      if (!val) return;
      const str = String(val).trim().toUpperCase();
      if (str && str !== 'N/A' && str !== 'UNDEFINED' && str !== 'NULL') {
        set.add(str);
      }
    };

    addClean(effectiveEmployeeId);
    addClean(effectiveEmployeeName);
    addClean(verifiedUser?.employeeId);
    addClean(verifiedUser?.username);
    addClean(verifiedUser?.id);
    addClean((verifiedUser as any)?._id);
    addClean(verifiedUser?.name);
    addClean(verifiedUser?.fullName);
    addClean(verifiedUser?.mobile);
    addClean((verifiedUser as any)?.mobileNumber);
    addClean(verifiedUser?.aadhaar);
    addClean((verifiedUser as any)?.aadhaarNumber);

    (employees || []).forEach((e: any) => {
      const eId = String(e.employeeId || '').trim().toUpperCase();
      const id = String(e.id || e._id || '').trim().toUpperCase();
      const name = String(e.name || (e as any).fullName || '').trim().toUpperCase();
      const mobile = String(e.mobile || (e as any).mobileNumber || '').trim().toUpperCase();
      const aadhaar = String(e.aadhaar || (e as any).aadhaarNumber || '').trim().toUpperCase();
      const uName = String((e as any).username || '').trim().toUpperCase();

      const isMe =
        (eId && set.has(eId)) ||
        (id && set.has(id)) ||
        (name && set.has(name)) ||
        (mobile && set.has(mobile)) ||
        (aadhaar && set.has(aadhaar)) ||
        (uName && set.has(uName));

      if (isMe) {
        addClean(e.employeeId);
        addClean(e.id);
        addClean(e._id);
        addClean(e.name);
        addClean((e as any).fullName);
        addClean(e.mobile);
        addClean((e as any).mobileNumber);
        addClean(e.aadhaar);
        addClean((e as any).aadhaarNumber);
        addClean((e as any).username);
      }
    });

    return set;
  }, [effectiveEmployeeId, effectiveEmployeeName, verifiedUser, employees]);

  // 1. SESSION HISTORY: Current date back to previous 62 days, strictly for logged-in employee
  const employeeRecords = useMemo(() => {
    if (myIdentitySet.size === 0) return [];

    const { now, todayStr, startDateStr } = dateWindow62Days;

    const myRecords = (attendanceRecords || []).filter(r => {
      if (!r) return false;
      const recEmpId = String(r.employeeId || '').trim().toUpperCase();
      const recEmpName = String(r.employeeName || '').trim().toUpperCase();
      const isMatch = myIdentitySet.has(recEmpId) || (recEmpName && myIdentitySet.has(recEmpName));
      return isMatch && r.date && r.date >= startDateStr && r.date <= todayStr;
    });

    const recordsByDate = new Map<string, any[]>();
    myRecords.forEach(r => {
      if (!recordsByDate.has(r.date)) recordsByDate.set(r.date, []);
      recordsByDate.get(r.date)!.push(r);
    });

    const approvedLeaveDates = new Map<string, any>();
    (leaveRequests || []).forEach((l: any) => {
      const lEmpId = String(l.employeeId || (l as any).employeeID || "").trim().toUpperCase();
      const lEmpName = String(l.employeeName || "").trim().toUpperCase();
      const isMatch = myIdentitySet.has(lEmpId) || (lEmpName && myIdentitySet.has(lEmpName));
      if (isMatch && String(l.status).toUpperCase() === 'APPROVED') {
        if (l.fromDate && l.toDate) {
          try {
            let cur = startOfDay(parseISO(l.fromDate));
            const end = startOfDay(parseISO(l.toDate));
            while (!isAfter(cur, end)) {
              approvedLeaveDates.set(format(cur, "yyyy-MM-dd"), l);
              cur = addDays(cur, 1);
            }
          } catch (e) { }
        }
      }
    });

    const fullHistory: any[] = [];
    let currentD = now;

    while (format(currentD, "yyyy-MM-dd") >= startDateStr) {
      const dateStr = format(currentD, "yyyy-MM-dd");

      if (recordsByDate.has(dateStr)) {
        // One record per date — take the first (or only) record
        const dayRecords = recordsByDate.get(dateStr)!;
        // Sort by inTime in case multiple legacy records exist; show the primary one
        dayRecords.sort((a, b) => (a.inTime || "").localeCompare(b.inTime || ""));
        fullHistory.push(dayRecords[0]);
      } else {
        const isSun = isSunday(currentD);
        const holidayObj = holidays.find((h: any) => h.date === dateStr);
        const leaveObj = approvedLeaveDates.get(dateStr);

        let displayStatus = isSun ? 'Weekly Off' : 'Absent';
        let attType = holidayObj ? holidayObj.name : 'N/A';
        let inPlant = holidayObj ? holidayObj.name : (isSun ? 'Weekly Off' : 'N/A');
        let remark = holidayObj ? holidayObj.name : (isSun ? 'Weekly Off' : 'Absent');

        if (holidayObj) {
          displayStatus = 'Holiday';
        } else if (leaveObj) {
          displayStatus = 'Leave';
          attType = leaveObj.purpose || 'Approved Leave';
          inPlant = 'On Leave';
          remark = `Approved Leave (${leaveObj.purpose || 'Leave'})`;
        }

        fullHistory.push({
          id: `missing-${dateStr}`,
          employeeName: effectiveEmployeeName,
          date: dateStr,
          inTime: null,
          outTime: null,
          hours: 0,
          status: displayStatus,
          attendanceType: attType,
          address: null,
          addressOut: null,
          inPlant: inPlant,
          remark: remark
        });
      }
      currentD = addDays(currentD, -1);
    }

    return fullHistory;
  }, [attendanceRecords, myIdentitySet, holidays, leaveRequests, effectiveEmployeeName, dateWindow62Days]);

  // 2. MONTHLY SUMMARY: Derived directly from Page Approvals → Active Tab → Attendance data source
  // Filtered strictly for the currently authenticated logged-in employee.
  const monthlySummaries = useMemo(() => {
    const now = currentTime || getISTTime();
    if (myIdentitySet.size === 0) return [];

    // Find the logged-in employee record for joining/inactive date checking (same as Approvals)
    const currentEmp = (employees || []).find((e: any) => {
      const eId = String(e.employeeId || e.id || (e as any)._id || "").trim().toUpperCase();
      const eName = String(e.name || (e as any).fullName || "").trim().toUpperCase();
      return myIdentitySet.has(eId) || (eName && myIdentitySet.has(eName));
    });

    // Approved leaves from leaveRequests matching logged-in employee
    const approvedLeavesMap = new Map<string, any>();
    (leaveRequests || []).forEach((l: any) => {
      const lEmpId = String(l.employeeId || (l as any).employeeID || "").trim().toUpperCase();
      const lEmpName = String(l.employeeName || "").trim().toUpperCase();
      const isMatch = myIdentitySet.has(lEmpId) || (lEmpName && myIdentitySet.has(lEmpName));
      if (isMatch && String(l.status).toUpperCase() === 'APPROVED') {
        if (l.fromDate && l.toDate) {
          try {
            const start = startOfDay(parseISO(l.fromDate));
            const end = startOfDay(parseISO(l.toDate));
            if (isValid(start) && isValid(end)) {
              let cur = start;
              while (!isAfter(cur, end)) {
                approvedLeavesMap.set(format(cur, "yyyy-MM-dd"), l);
                cur = addDays(cur, 1);
              }
            }
          } catch (e) { }
        }
      }
    });

    // Active attendance punches for logged-in employee from attendance collection (Approvals Active source)
    const myPunches = (attendanceRecords || []).filter((r: any) => {
      if (!r) return false;
      const recEmpId = String(r.employeeId || '').trim().toUpperCase();
      const recEmpName = String(r.employeeName || '').trim().toUpperCase();
      return myIdentitySet.has(recEmpId) || (recEmpName && myIdentitySet.has(recEmpName));
    });

    const punchesByDate = new Map<string, any[]>();
    myPunches.forEach((r: any) => {
      if (r.date) {
        const list = punchesByDate.get(r.date) || [];
        list.push(r);
        punchesByDate.set(r.date, list);
      }
    });




    const result = [];
    for (let i = 0; i < 3; i++) {
      const mDate = subMonths(now, i);
      const mKey = format(mDate, "yyyy-MM");
      const monthYearLabel = format(mDate, "MMMM yyyy");
      const start = startOfMonth(mDate);
      const end = isSameMonth(mDate, now) ? now : endOfMonth(mDate);

      let totalPresent = 0;
      let totalLeave = 0;
      let totalAbsent = 0;
      let totalMinutes = 0;

      let cur = startOfDay(start);
      const endDay = startOfDay(end);

      while (!isAfter(cur, endDay)) {
        const dStr = format(cur, "yyyy-MM-dd");

        // Respect employee join date and inactive date if defined
        if (currentEmp && !isEmployeeActiveOnDate(currentEmp, dStr)) {
          cur = addDays(cur, 1);
          continue;
        }

        const dayPunches = punchesByDate.get(dStr) || [];
        const hasAttendance = dayPunches.some((p: any) => p && p.inTime);
        const approvedLeave = approvedLeavesMap.get(dStr);
        const isSun = isSunday(parseISO(dStr));
        const customHoliday = (holidays || []).find((h: any) => h.date === dStr && !h.auto);

        // Priority 1: Valid attendance -> Present
        if (hasAttendance) {
          totalPresent++;
          // One record per day — take the primary punch record
          const punchRec = dayPunches[0];
          if (punchRec) {
            let hours = typeof punchRec.hours === "number" ? punchRec.hours : 0;
            // Auto checkout estimation if unclosed shift
            if (!punchRec.outTime && punchRec.inTime) {
              const inDT = (punchRec.inDate && punchRec.inTime)
                ? parseDateTime(punchRec.inDate, punchRec.inTime)
                : (punchRec.date && punchRec.inTime)
                  ? parseDateTime(punchRec.date, punchRec.inTime)
                  : (punchRec.inDateTime ? parseISO(punchRec.inDateTime) : null);
              if (inDT && isValid(inDT)) {
                const diffHours = (now.getTime() - inDT.getTime()) / (1000 * 60 * 60);
                // 16h trigger, 8h credited
                if (diffHours >= 16) {
                  hours = 8.0;
                }
              }
            }
            totalMinutes += Math.round(hours * 60);
          }
        } else if (approvedLeave) {
          // Priority 2: No attendance + Approved Leave -> Leave
          totalLeave++;
        } else if (!isSun && !customHoliday) {
          // Priority 3: No attendance + No Approved Leave -> Absent (Weekly Off/Holiday excluded from Absent)
          totalAbsent++;
        }

        cur = addDays(cur, 1);
      }

      const totalHoursFloat = totalMinutes / 60;

      result.push({
        monthKey: mKey,
        monthYear: monthYearLabel,
        present: totalPresent,
        leave: totalLeave,
        absent: totalAbsent,
        workedHours: formatHoursToHHMM(totalHoursFloat),
        rank: 0,          // populated asynchronously from /api/attendance/monthly-rank
        isCurrentMonth: i === 0,
      });
    }

    return result;
  }, [attendanceRecords, myIdentitySet, employees, holidays, leaveRequests, currentTime]);

  // Fetch competition ranks server-side once employee is identified.
  // Uses stable deps (effectiveEmployeeId only) — not monthlySummaries (which changes every second via currentTime).
  useEffect(() => {
    if (!isEmployeeLogin || !isMounted) return;

    const myEmpId = (effectiveEmployeeId && effectiveEmployeeId !== 'N/A')
      ? effectiveEmployeeId
      : (verifiedUser?.employeeId || verifiedUser?.username || '');
    if (!myEmpId) return;

    // Compute the 3 month keys (current + previous 2) directly here — avoids depending on volatile monthlySummaries
    const now = getISTTime();
    const monthKeys = [0, 1, 2].map(i => {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    });

    let cancelled = false;
    const fetchRanks = async () => {
      const updates: Record<string, number> = {};
      await Promise.all(
        monthKeys.map(async (mKey) => {
          try {
            const url = `/api/attendance/monthly-rank?month=${encodeURIComponent(mKey)}&employeeId=${encodeURIComponent(myEmpId)}`;
            const res = await fetch(url, { cache: 'no-store' });
            if (res.ok) {
              const json = await res.json();
              if (json.success && typeof json.rank === 'number' && json.rank > 0) {
                updates[mKey] = json.rank;
              }
            }
          } catch { /* network error — ignore */ }
        })
      );
      if (!cancelled) {
        setMonthlyRanks(updates);
      }
    };

    fetchRanks();
    return () => { cancelled = true; };
  // Re-fetch only when employee changes or on mount, not every second
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEmployeeLogin, isMounted, effectiveEmployeeId]);

  // 3. LEAVE HISTORY: Current Financial Year (FY) only, Approved records only, grouped month-wise
  const fyMonthWiseLeaves = useMemo(() => {
    if (myIdentitySet.size === 0) return [];

    const { startDateStr, endDateStr } = currentFYInfo;
    const fyStart = startOfDay(parseISO(startDateStr));
    const fyEnd = startOfDay(parseISO(endDateStr));

    const approvedLeaves = (leaveRequests || []).filter((l: any) => {
      const lEmpId = String(l.employeeId || (l as any).employeeID || "").trim().toUpperCase();
      const lEmpName = String(l.employeeName || "").trim().toUpperCase();
      const isMatch = myIdentitySet.has(lEmpId) || (lEmpName && myIdentitySet.has(lEmpName));
      if (!isMatch) return false;
      if (String(l.status).toUpperCase() !== 'APPROVED') return false;
      if (!l.fromDate || !l.toDate) return false;

      try {
        const fromD = startOfDay(parseISO(l.fromDate));
        const toD = startOfDay(parseISO(l.toDate));
        return !isAfter(fromD, fyEnd) && !isBefore(toD, fyStart);
      } catch (e) {
        return false;
      }
    });

    const monthGroups = new Map<string, {
      monthKey: string;
      monthLabel: string;
      totalLeaveDays: number;
      records: any[];
    }>();

    approvedLeaves.forEach((leave: any) => {
      try {
        const fromD = startOfDay(parseISO(leave.fromDate));
        const toD = startOfDay(parseISO(leave.toDate));
        const actualStart = isBefore(fromD, fyStart) ? fyStart : fromD;
        const actualEnd = isAfter(toD, fyEnd) ? fyEnd : toD;

        const monthDaysMap = new Map<string, number>();
        let cur = actualStart;
        while (!isAfter(cur, actualEnd)) {
          const mKey = format(cur, "yyyy-MM");
          const dayIncrement = leave.leaveType === 'HALF_DAY' ? 0.5 : 1;
          monthDaysMap.set(mKey, (monthDaysMap.get(mKey) || 0) + dayIncrement);
          cur = addDays(cur, 1);
        }

        monthDaysMap.forEach((daysInMonth, mKey) => {
          if (!monthGroups.has(mKey)) {
            const mDate = parseISO(`${mKey}-01`);
            monthGroups.set(mKey, {
              monthKey: mKey,
              monthLabel: format(mDate, "MMM-yyyy"),
              totalLeaveDays: 0,
              records: [],
            });
          }
          const group = monthGroups.get(mKey)!;
          group.totalLeaveDays += daysInMonth;
          group.records.push({
            ...leave,
            daysInThisMonth: daysInMonth,
          });
        });
      } catch (e) { }
    });

    return Array.from(monthGroups.values())
      .filter((g) => g.totalLeaveDays > 0)
      .sort((a, b) => b.monthKey.localeCompare(a.monthKey));
  }, [myIdentitySet, leaveRequests, currentFYInfo]);

  const { activeRecord, todayRecord, todaySessions, hasMarkedInToday, isStale, canMarkOut, nextOutAvailableAt } = useMemo(() => {
    const now = currentTime || getISTTime();
    const todayStr = format(now, "yyyy-MM-dd");

    // Match raw attendance records for this employee directly from database
    const myRawRecords = (attendanceRecords || []).filter(r => {
      if (!r) return false;
      const recEmpId = String(r.employeeId || '').trim().toUpperCase();
      const recEmpName = String(r.employeeName || '').trim().toUpperCase();
      return myIdentitySet.has(recEmpId) || (recEmpName && myIdentitySet.has(recEmpName));
    });

    // One Mark IN per calendar date: find any record for today (any status)
    const todayRecs = myRawRecords.filter((r) => r.date === todayStr);
    const todayRec = todayRecs[0] || null;

    // Active open shift (any date)
    const active = myRawRecords.find((r) => r.status === "Open" || (r.inTime && !r.outTime && r.status !== "Closed" && r.status !== "Auto OUT"));

    // Employee has already marked IN today if any record exists for today
    const markedInToday = todayRecs.length > 0;

    const inDT = (active?.inDate && active?.inTime)
      ? parseDateTime(active.inDate, active.inTime)
      : (active?.date && active?.inTime)
        ? parseDateTime(active.date, active.inTime)
        : (active?.inDateTime ? parseISO(active.inDateTime) : null);

    let canOut = false;
    let nextOutAt: Date | null = null;

    if (active && inDT && isValid(inDT)) {
      // Can Mark OUT immediately once IN is recorded
      canOut = !isAfter(inDT, now);
      nextOutAt = inDT;
    }

    // Stale: 16 hours have elapsed since Mark IN (auto-close trigger)
    let stale = false;
    if (active && inDT && isValid(inDT)) {
      const triggerTime = addHours(inDT, 16);
      if (isAfter(now, triggerTime)) stale = true;
    }

    return {
      activeRecord: active || null,
      todayRecord: todayRec || null,
      todaySessions: todayRecs,
      hasMarkedInToday: markedInToday,
      isStale: stale,
      canMarkOut: !!(active && canOut),
      nextOutAvailableAt: nextOutAt && isValid(nextOutAt) ? nextOutAt : null,
    };
  }, [attendanceRecords, myIdentitySet, currentTime]);

  useEffect(() => {
    activeRecordRef.current = activeRecord;
  }, [activeRecord]);

  // Auto-OUT effect: triggers when shift has been open for 16+ hours
  useEffect(() => {
    if (isEmployeeLogin && isStale && activeRecord && !isMutatingAttendance && !isAutoTriggering.current) {
      requestLocation("OUT_AUTO");
    }
  }, [isEmployeeLogin, isStale, activeRecord]);

  // Geofence boundary tracker (only for active employee shift)
  useEffect(() => {
    if (!isEmployeeLogin || !activeRecord || activeRecord.status !== "Open" || !navigator.geolocation) return;

    const empRecord = (employees || []).find((e: any) => e.employeeId === effectiveEmployeeId);
    const empDesignation = empRecord?.designation || verifiedUser?.designation || "Staff";

    const trackGeofenceBoundary = async () => {
      navigator.geolocation.getCurrentPosition(
        async (position) => {
          const latestRecord = activeRecordRef.current;
          if (!latestRecord || latestRecord.status !== "Open") return;

          const { latitude: lat, longitude: lng } = position.coords;
          const timeNowStr = format(getISTTime(), "yyyy-MM-dd HH:mm");

          let currentEvents = latestRecord.exitEvents ? [...latestRecord.exitEvents] : [];
          let currentActiveEvent = currentEvents.find((e: any) => !e.inPlantTime && e.trackingStatus === "Outside Plant");

          const plantDistances = (plants || []).map(p => ({
            plant: p,
            distanceM: getPreciseDistance(lat, lng, p.lat, p.lng)
          }));

          const nearest = plantDistances.sort((a, b) => a.distanceM - b.distanceM)[0];
          const allowedRadiusM = 700;
          const isOutsideAllPlants = !nearest || nearest.distanceM > allowedRadiusM;

          if (isOutsideAllPlants) {
            let geocodedAddress = "Location Unavailable";
            try {
              const res = await fetch('/api/geocode/reverse', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ lat, lng })
              });
              if (res.ok) {
                const data = await res.json();
                geocodedAddress = data?.address?.Match_addr || data?.address || "Salt Plant Outside Zone";
              }
            } catch (e) {
              console.error("Geofence reverse geocoding failed", e);
            }

            const newLocationHistoryPoint = {
              time: timeNowStr,
              address: geocodedAddress,
              lat,
              lng,
              distance: nearest ? parseFloat(nearest.distanceM.toFixed(1)) : 0
            };

            let shouldUpdate = false;
            if (!currentActiveEvent) {
              currentActiveEvent = {
                employeeCode: effectiveEmployeeId,
                employeeName: effectiveEmployeeName,
                designation: empDesignation,
                plant: latestRecord.inPlant || "Salt Plant",
                date: latestRecord.date,
                outPlantTime: timeNowStr,
                gpsLatitude: lat,
                gpsLongitude: lng,
                completeAddress: geocodedAddress,
                distanceFromPlant: nearest ? Math.round(nearest.distanceM) : null,
                outLocationHistory: [newLocationHistoryPoint],
                inPlantTime: null,
                totalOutDuration: null,
                currentPlant: null,
                trackingStatus: "Outside Plant"
              };
              currentEvents.push(currentActiveEvent);
              shouldUpdate = true;
            } else {
              const history = currentActiveEvent.outLocationHistory || [];
              const lastPoint = history[history.length - 1];
              currentActiveEvent.gpsLatitude = lat;
              currentActiveEvent.gpsLongitude = lng;
              if (geocodedAddress !== "Location Unavailable") currentActiveEvent.completeAddress = geocodedAddress;
              if (nearest) currentActiveEvent.distanceFromPlant = Math.round(nearest.distanceM);
              if (!lastPoint || lastPoint.address !== geocodedAddress || lastPoint.lat !== lat) {
                history.push(newLocationHistoryPoint);
                currentActiveEvent.outLocationHistory = history;
                shouldUpdate = true;
              }
            }

            // Immediately save to MongoDB plantExits collection via API
            fetch('/api/exit-tracking', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                employeeCode: effectiveEmployeeId,
                employeeName: effectiveEmployeeName,
                designation: empDesignation,
                plant: latestRecord.inPlant || "Salt Plant",
                date: latestRecord.date,
                attendanceId: latestRecord.id || latestRecord._id,
                sessionIndex: latestRecord.sessionIndex || 1,
                gpsLatitude: lat,
                gpsLongitude: lng,
                completeAddress: geocodedAddress,
                distanceFromPlant: nearest ? Math.round(nearest.distanceM) : null,
                action: 'OUT'
              })
            }).catch((err) => console.warn("Facility exit tracking POST failed", err));

            if (shouldUpdate) {
              await updateRecord('attendance', latestRecord.id || latestRecord._id, {
                exitEvents: currentEvents,
                currentGeofenceStatus: "Outside Plant"
              });
              await refreshData();
            }
          } else {
            if (currentActiveEvent) {
              const exitTimeParsed = parseISO(currentActiveEvent.outPlantTime.replace(" ", "T"));
              const duration = differenceInMinutes(getISTTime(), exitTimeParsed);
              const hh = String(Math.floor(Math.max(0, duration) / 60)).padStart(2, '0');
              const mm = String(Math.max(0, duration) % 60).padStart(2, '0');

              const qualifyingPlants = (plants || [])
                .map(p => ({ plant: p, distanceM: getPreciseDistance(lat, lng, p.lat, p.lng) }))
                .filter(x => x.distanceM <= (x.plant.radius || 700))
                .sort((a, b) => a.distanceM - b.distanceM);

              const returnPlant = qualifyingPlants[0]?.plant;

              currentActiveEvent.inPlantTime = timeNowStr;
              currentActiveEvent.totalOutDuration = `${hh}:${mm}`;
              currentActiveEvent.currentPlant = returnPlant?.name || latestRecord.inPlant || "Salt Plant";
              currentActiveEvent.trackingStatus = "Returned";

              // Immediately update MongoDB plantExits via API
              fetch('/api/exit-tracking', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  employeeCode: effectiveEmployeeId,
                  attendanceId: latestRecord.id || latestRecord._id,
                  plant: returnPlant?.name || latestRecord.inPlant || "Salt Plant",
                  gpsLatitude: lat,
                  gpsLongitude: lng,
                  action: 'RETURN'
                })
              }).catch((err) => console.warn("Facility return tracking POST failed", err));

              await updateRecord('attendance', latestRecord.id || latestRecord._id, {
                exitEvents: currentEvents,
                currentGeofenceStatus: "Inside Plant"
              });

              toast({
                title: "Returned to Plant",
                description: `Welcome back inside the geofence perimeter.`
              });
              await refreshData();
            }
          }
        },
        async (error) => {
          console.error("Geofence verification lookup failed", error);
          const latestRecord = activeRecordRef.current;
          if (!latestRecord || latestRecord.status !== "Open") return;

          let currentEvents = latestRecord.exitEvents ? [...latestRecord.exitEvents] : [];
          let currentActiveEvent = currentEvents.find((e: any) => !e.inPlantTime && e.trackingStatus === "Outside Plant");
          if (currentActiveEvent) {
            currentActiveEvent.completeAddress = "Location Not Available";
            currentActiveEvent.trackingStatus = "Location Not Available";
            await updateRecord('attendance', latestRecord.id || latestRecord._id, {
              exitEvents: currentEvents,
              currentGeofenceStatus: "Location Not Available"
            });
            await refreshData();
          }
        },
        { enableHighAccuracy: true, timeout: 5000, maximumAge: 30000 }
      );
    };

    const geofenceWorkerId = setInterval(trackGeofenceBoundary, 15 * 60 * 1000);
    trackGeofenceBoundary();
    return () => clearInterval(geofenceWorkerId);
  }, [isEmployeeLogin, activeRecord?.id, activeRecord?.status, plants, employees, effectiveEmployeeId, effectiveEmployeeName, verifiedUser]);

  const punchCheckIn = async (finalInPlant: string, attendanceType: string, plantName: string, geofenceStatus: string) => {
    if (isMutatingAttendance) return;
    setIsMutatingAttendance(true);

    const now = getISTTime();
    const today = format(now, "yyyy-MM-dd");
    const timeStr = format(now, "HH:mm");

    const newRecordData = {
      employeeId: effectiveEmployeeId,
      employeeName: effectiveEmployeeName,
      aadhaarNumber: "[Aadhaar Redacted]",
      mobileNumber: verifiedUser?.mobileNumber || "N/A",
      sessionIndex: 1,
      sessionNumber: 1,
      date: today,
      inDate: today,
      inTime: timeStr,
      inDateTime: now.toISOString(),
      hours: 0,
      status: 'Open',
      attendanceType: attendanceType,
      lat: currentGPS?.lat || 28.6329,
      lng: currentGPS?.lng || 77.4357,
      address: detectedAddress || (detectedPlant ? detectedPlant.name : "Registered Zone"),
      street: detectedPlant ? (detectedPlant.name || "Plant") : (detailedLocation.street || "Industrial Bypass"),
      area: detectedPlant ? "Plant Radius Zone" : (detailedLocation.area || "Industrial Zone"),
      city: detailedLocation.city || "NCR",
      state: detailedLocation.state || "Uttar Pradesh",
      pincode: detailedLocation.pincode || "N/A",
      inPlant: finalInPlant,
      remark: `Checked IN for ${attendanceType}`,
      approved: false,
      unapprovedOutDuration: 0,
      currentGeofenceStatus: geofenceStatus,
      exitEvents: []
    };

    try {
      const response = await fetch('/api/attendance/mark-in', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...newRecordData,
          userRole: 'EMPLOYEE',
          selectedType,
          plantName,
        })
      });

      if (response.ok) {
        // MongoDB confirmed the save — immediately update UI state and trigger background sync
        const resData = await response.json().catch(() => ({}));
        const savedRecord = resData?.data || { ...newRecordData, id: resData?.id || String(Date.now()), _id: resData?.id || String(Date.now()) };
        upsertAttendanceRecord(savedRecord);
        setSelectedType("");
        setActiveDialog("NONE");
        toast({ title: `Mark IN Successful!`, description: detectedPlant ? `Attendance marked at ${plantName}` : `Logged as ${attendanceType}` });
        refreshData().catch(() => {});
      } else {
        // Always treat non-OK as a hard failure — never fall through to a local-only record.
        // MongoDB has not confirmed the save, so we must not show a success state.
        const errData = await response.json().catch(() => ({}));
        toast({
          variant: "destructive",
          title: "Mark IN Failed",
          description: errData?.message || "Server rejected the request. Please try again.",
        });
        return;
      }
    } catch (e) {
      console.error("Check-in error:", e);
      toast({ variant: "destructive", title: "Error", description: "Failed to process database entry register log." });
    } finally {
      setIsMutatingAttendance(false);
    }
  };

  const handleMarkInClick = (e?: React.MouseEvent | React.FormEvent) => {
    e?.preventDefault?.();
    e?.stopPropagation?.();
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      toast({
        variant: "destructive",
        title: "Offline",
        description: "You aren’t connected with internet. Please connect your device with internet",
      });
      return;
    }
    // One Mark IN per calendar date — block if already marked in today
    if (hasMarkedInToday) {
      toast({
        variant: "destructive",
        title: "Already Marked IN Today",
        description: "You have already marked IN for today. A new Mark IN is allowed only on the next calendar date.",
      });
      return;
    }
    if (isMutatingAttendance || !!activeRecord) return;

    setActiveDialog("IN");
    requestLocation("IN");
  };

  const punchCheckOut = async () => {
    if (!activeRecord || isMutatingAttendance) return;

    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      toast({
        variant: "destructive",
        title: "Offline",
        description: "You aren’t connected with internet. Please connect your device with internet",
      });
      return;
    }

    if (!activeRecord.inTime) {
      toast({
        variant: "destructive",
        title: "Mark IN Required",
        description: "Cannot Mark OUT because no valid Mark IN record exists for today.",
      });
      return;
    }

    const now = getISTTime();
    const inDateStr = activeRecord.inDate || activeRecord.date;
    const inTimeStr = activeRecord.inTime;
    let inDT: Date | null = null;
    if (inDateStr && inTimeStr) {
      inDT = parseDateTime(inDateStr, inTimeStr);
    }
    if (!inDT || !isValid(inDT)) {
      if (activeRecord.inDateTime) {
        try { inDT = parseISO(activeRecord.inDateTime); } catch {}
      }
    }
    let outDT = parseDateTime(format(now, "yyyy-MM-dd"), format(now, "HH:mm")) || now;

    if (!inDT || !isValid(inDT)) {
      toast({
        variant: "destructive",
        title: "Invalid Mark IN",
        description: "Stored Mark IN date/time is invalid. Please Mark IN again.",
      });
      return;
    }

    let finalHours = 0;
    if (isValid(inDT) && isValid(outDT)) {
      let diffMs = outDT.getTime() - inDT.getTime();
      if (diffMs < 0) {
        const nextDayOutDT = addHours(outDT, 24);
        if (nextDayOutDT.getTime() - inDT.getTime() >= 0) {
          outDT = nextDayOutDT;
          diffMs = outDT.getTime() - inDT.getTime();
        }
      }
      const elapsedMinutes = Math.max(0, Math.round(diffMs / 60000));
      finalHours = parseFloat((elapsedMinutes / 60).toFixed(4));
    }

    // No cooldown after Mark OUT — next Mark IN is only allowed on the next calendar date
    const recordId = activeRecord.id || (activeRecord as any)._id;

    if (!recordId) {
      toast({ variant: "destructive", title: "Error", description: "Record ID not found." });
      return;
    }

    setIsMutatingAttendance(true);

    try {
      let finalExitEvents = activeRecord.exitEvents ? [...activeRecord.exitEvents] : [];
      let incompleteEvent = finalExitEvents.find((e: any) => !e.inPlantTime && e.trackingStatus === "Outside Plant");
      if (incompleteEvent) {
        const timeNowStr = format(now, "yyyy-MM-dd HH:mm");
        const exitTimeParsed = parseISO(incompleteEvent.outPlantTime.replace(" ", "T"));
        const duration = differenceInMinutes(now, exitTimeParsed);
        const hh = String(Math.floor(Math.max(0, duration) / 60)).padStart(2, '0');
        const mm = String(Math.max(0, duration) % 60).padStart(2, '0');
        incompleteEvent.inPlantTime = timeNowStr;
        incompleteEvent.totalOutDuration = `${hh}:${mm}`;
        incompleteEvent.currentPlant = incompleteEvent.plant || activeRecord.inPlant || "Salt Plant";
        incompleteEvent.trackingStatus = "Returned";
      }

      const outPayload = {
        id: recordId,
        recordId: recordId,
        employeeId: effectiveEmployeeId,
        userRole: 'EMPLOYEE',
        outTime: format(outDT, "HH:mm"),
        outDate: format(outDT, "yyyy-MM-dd"),
        outDateTime: outDT.toISOString(),
        hours: finalHours,
        status: 'Closed',
        outType: 'Manual',
        latOut: currentGPS?.lat || activeRecord.lat || 28.6329,
        lngOut: currentGPS?.lng || activeRecord.lng || 77.4357,
        addressOut: detectedAddress || activeRecord.address || (detectedPlant as any)?.address || "Registered Zone",
        streetOut: detectedPlant ? (detectedPlant.name || "Plant") : (detailedLocation.street || activeRecord.street || "Unknown Street"),
        areaOut: detectedPlant ? "Plant Radius Zone" : (detailedLocation.area || activeRecord.area || "Unknown Area"),
        cityOut: detectedPlant ? (detectedPlant as any).city || activeRecord.city || "NCR" : (detailedLocation.city || activeRecord.city || "NCR"),
        stateOut: detectedPlant ? "Uttar Pradesh" : (detailedLocation.state || activeRecord.state || "NCR"),
        pincodeOut: detailedLocation.pincode || activeRecord.pincode || "N/A",
        outPlant: detectedPlant ? detectedPlant.name : (activeRecord.inPlant || "Outside"),
        nextInEnableTime: null, // No cooldown — next Mark IN only on next calendar date
        exitEvents: finalExitEvents,
        currentGeofenceStatus: "Shift Closed"
      };

      const response = await fetch('/api/attendance/mark-out', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(outPayload)
      });

      if (response.ok) {
        // MongoDB confirmed the save — immediately update UI state and trigger background sync
        const resData = await response.json().catch(() => ({}));
        const savedRecord = resData?.data || { ...activeRecord, ...outPayload };
        upsertAttendanceRecord(savedRecord);
        setActiveDialog("NONE");
        const displayHHMM = calculateWorkingHoursHHMM(savedRecord.inDate || savedRecord.date, savedRecord.inTime, savedRecord.outDate || savedRecord.date, savedRecord.outTime, savedRecord.hours || finalHours);
        toast({ title: `Mark OUT Successful!`, description: `Shift completed. Working Hours: ${displayHHMM}` });
        refreshData().catch(() => {});
      } else {
        // Always treat non-OK as a hard failure — never fall through to a local-only update.
        // MongoDB has not confirmed the save, so we must not show a success state.
        const errData = await response.json().catch(() => ({}));
        toast({
          variant: "destructive",
          title: "Mark OUT Failed",
          description: errData?.message || "Server rejected the request. Please try again.",
        });
        return;
      }

    } catch (e) {
      console.error("Check-out error:", e);
      toast({ variant: "destructive", title: "Error", description: "Failed to Mark OUT" });
    } finally {
      setIsMutatingAttendance(false);
    }
  };

  const handleMarkOutClick = (e?: React.MouseEvent | React.FormEvent) => {
    e?.preventDefault?.();
    e?.stopPropagation?.();
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      toast({
        variant: "destructive",
        title: "Offline",
        description: "You aren’t connected with internet. Please connect your device with internet",
      });
      return;
    }
    if (!activeRecord || !canMarkOut || isMutatingAttendance) return;

    setActiveDialog("OUT");
    requestLocation("OUT");
  };

  const performAutoCheckOut = async (lat: number, lng: number, address: string, components: any, plant: Plant | null) => {
    if (!activeRecord || isMutatingAttendance) return;

    let inDT: Date | null = null;
    if (activeRecord.inDate && activeRecord.inTime) {
      inDT = parseDateTime(activeRecord.inDate, activeRecord.inTime);
    } else if (activeRecord.date && activeRecord.inTime) {
      inDT = parseDateTime(activeRecord.date, activeRecord.inTime);
    } else if (activeRecord.inDateTime) {
      inDT = parseISO(activeRecord.inDateTime);
    }
    if (!inDT || !isValid(inDT)) return;

    // Auto Mark OUT: trigger at 16h, record working time as 8h after Mark IN
    const thresholdHours = 16;
    const creditedHours = 8.0;

    setIsMutatingAttendance(true);
    try {
      // Route through the dedicated auto-mark-out API.
      // This ensures: business rules are enforced, MongoDB is written atomically,
      // and realtimeBroadcaster fires AFTER the confirmed save.
      const res = await fetch('/api/attendance/auto-mark-out', { method: 'POST' });

      if (!res.ok) {
        // Graceful degradation: if the dedicated API is unavailable, fall back to
        // a direct generic update so the employee isn't left with a stuck shift.
        const creditOutDT = addHours(inDT, creditedHours);
        await updateRecord('attendance', activeRecord.id || (activeRecord as any)._id, {
          outTime: format(creditOutDT, "HH:mm"),
          outDate: format(creditOutDT, "yyyy-MM-dd"),
          outDateTime: creditOutDT.toISOString(),
          hours: creditedHours,
          status: 'Auto OUT',
          outType: 'Auto',
          autoCheckout: true,
          autoOut: true,
          autoTriggerTime: getISTTime().toISOString(),
          nextInEnableTime: getISTTime().toISOString(),
          remark: `System Auto-Logged OUT (16h limit reached). Recorded working time: ${creditedHours}h (8h after Mark IN).`
        });
      }

      toast({
        title: "Attendance Auto Closed",
        description: `Shift auto-closed (16h limit). Working hours credited: ${creditedHours}h.`
      });

      await refreshData();
    } catch (e) {
      console.error("Auto checkout error:", e);
    } finally {
      setIsMutatingAttendance(false);
      isAutoTriggering.current = false;
    }
  };

  const requestLocation = (type: "IN" | "OUT" | "OUT_AUTO") => {
    if (type === "IN" && hasMarkedInToday) {
      toast({
        variant: "destructive",
        title: "Already Marked IN Today",
        description: "You have already marked IN for today. A new Mark IN is allowed only on the next calendar date.",
      });
      return;
    }

    if (isMutatingAttendance) return;

    if (type !== "OUT_AUTO") {
      setActiveDialog(type);
    }

    // Only set loading if no coordinates exist at all
    if (!currentGPS) {
      setIsLoadingLocation(true);
    }

    if (type === "OUT_AUTO") {
      isAutoTriggering.current = true;
    }

    const processGeocoding = (lat: number, lng: number, accuracy: number) => {
      try {
        setGpsAccuracy(accuracy);
        setLocationPermissionStatus("granted");
        setLocationPermissionMessage(null);
        setCurrentGPS({ lat, lng });

        // Immediate plant distance computation (0ms)
        const sortedAllPlants = (plants || [])
          .map(p => ({ plant: p, distance: Math.round(getPreciseDistance(lat, lng, p.lat, p.lng)) }))
          .sort((a, b) => a.distance - b.distance);

        let defaultPlantAddr = "";
        if (sortedAllPlants.length > 0) {
          setNearestPlantInfo(sortedAllPlants[0]);
          if (sortedAllPlants[0].distance <= (sortedAllPlants[0].plant.radius || 700)) {
            setDetectedPlant(sortedAllPlants[0].plant);
            defaultPlantAddr = sortedAllPlants[0].plant.name + (((sortedAllPlants[0].plant as any).location) ? ` (${(sortedAllPlants[0].plant as any).location})` : "");
            // Instantly fill detectedAddress so confirmation button is immediately active!
            setDetectedAddress((prev) => prev || defaultPlantAddr);
          } else {
            setDetectedPlant(null);
          }
        } else {
          setNearestPlantInfo(null);
          setDetectedPlant(null);
        }

        if (type !== "OUT_AUTO") {
          setIsLoadingLocation(false);
        }

        // Fast background reverse geocoding to enrich address details
        fetch('/api/geocode/reverse', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ lat, lng })
        }).then(res => res.ok ? res.json() : null)
          .then(data => {
            if (data?.address) {
              const geocodedAddress = typeof data.address === 'object'
                ? (data.address.Match_addr || data.address.LongLabel || data.address.Address || "")
                : data.address;
              if (geocodedAddress) {
                setDetectedAddress(geocodedAddress);
              }
            }
            if (data?.components) {
              setDetailedLocation({
                street: typeof data.components?.street === 'string' ? data.components.street : '',
                area: typeof data.components?.area === 'string' ? data.components.area : '',
                city: typeof data.components?.city === 'string' ? data.components.city : '',
                state: typeof data.components?.state === 'string' ? data.components.state : '',
                pincode: typeof data.components?.pincode === 'string' ? data.components.pincode : '',
              });
            }

            if (type === "OUT_AUTO" && isAutoTriggering.current) {
              isAutoTriggering.current = false;
              const autoPlant = sortedAllPlants.length > 0 && sortedAllPlants[0].distance <= (sortedAllPlants[0].plant.radius || 700)
                ? sortedAllPlants[0].plant
                : null;
              performAutoCheckOut(lat, lng, data?.address || defaultPlantAddr, data?.components || {}, autoPlant);
            }
          }).catch((error) => {
            console.warn("Reverse geocode background error:", error);
            if (type === "OUT_AUTO" && isAutoTriggering.current) {
              isAutoTriggering.current = false;
              const autoPlant = sortedAllPlants.length > 0 && sortedAllPlants[0].distance <= (sortedAllPlants[0].plant.radius || 700)
                ? sortedAllPlants[0].plant
                : null;
              performAutoCheckOut(lat, lng, defaultPlantAddr || "Plant Area", {}, autoPlant);
            }
          });

      } catch (error) {
        console.error("Fast geocoding failed", error);
      } finally {
        if (type !== "OUT_AUTO") {
          setIsLoadingLocation(false);
        }
      }
    };

    if (!navigator.geolocation) {
      setLocationPermissionStatus("unavailable");
      setLocationPermissionMessage("Please allow location access to mark attendance.");
      setIsLoadingLocation(false);
      return;
    }

    const emergencyTimeout = setTimeout(() => {
      setIsLoadingLocation(false);
      if (!currentGPS) {
        toast({
          variant: "destructive",
          title: "GPS Tracking Timeout",
          description: "System could not identify device coordinates in time. Please retry."
        });
      }
    }, 5000);

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        clearTimeout(emergencyTimeout);
        processGeocoding(pos.coords.latitude, pos.coords.longitude, pos.coords.accuracy);
      },
      (err: GeolocationPositionError) => {
        clearTimeout(emergencyTimeout);
        setIsLoadingLocation(false);
        if (!currentGPS) {
          setLocationPermissionStatus("denied");
          setLocationPermissionMessage("Please allow location access to mark attendance.");
        }
      },
      { enableHighAccuracy: true, timeout: 5000, maximumAge: 30000 }
    );
  };

  const handleConfirmCheckIn = async (e?: React.MouseEvent | React.FormEvent) => {
    e?.preventDefault?.();
    e?.stopPropagation?.();
    if (isMutatingAttendance) return;

    // Outside plant: selecting WFH or Field Work is required
    if (!detectedPlant && !selectedType) {
      toast({ variant: "destructive", title: "Selection Mandatory", description: "Please select WFH or Field Work to continue outside radius bounds." });
      return;
    }

    const plantName = detectedPlant ? detectedPlant.name : "N/A";
    let finalInPlant = "N/A";
    let attendanceType = "N/A";

    if (detectedPlant) {
      finalInPlant = detectedPlant.name;
      attendanceType = 'Plant Attendance';
    } else {
      finalInPlant = selectedType === 'WFH' ? 'Outside-WFM' : 'Outside-Field Work';
      attendanceType = selectedType === 'WFH' ? 'Work From Home' : 'Field Work';
    }

    await punchCheckIn(finalInPlant, attendanceType, plantName, detectedPlant ? "Inside Plant" : "Outside Plant");
  };

  const handleConfirmCheckOut = async (e?: React.MouseEvent | React.FormEvent) => {
    e?.preventDefault?.();
    e?.stopPropagation?.();
    if (!activeRecord || isMutatingAttendance) return;

    await punchCheckOut();
  };

  // ==========================================
  // ADMIN VIEW: Selected Employee Data Resolution
  // ==========================================
  const selectedAdminEmployee = useMemo(() => {
    if (!selectedAdminEmployeeId) return null;
    return employees.find(e =>
      e.employeeId === selectedAdminEmployeeId ||
      e.id === selectedAdminEmployeeId ||
      (e as any)._id === selectedAdminEmployeeId
    ) || null;
  }, [employees, selectedAdminEmployeeId]);

  const selectedAdminEmployeeIdentitySet = useMemo(() => {
    const set = new Set<string>();
    if (!selectedAdminEmployee) return set;
    const add = (v: any) => {
      if (v) set.add(String(v).trim().toUpperCase());
    };
    add(selectedAdminEmployee.employeeId);
    add(selectedAdminEmployee.id);
    add((selectedAdminEmployee as any)._id);
    add(selectedAdminEmployee.name);
    add((selectedAdminEmployee as any).fullName);
    add(selectedAdminEmployee.aadhaar);
    add(selectedAdminEmployee.aadhaarNumber);
    add(selectedAdminEmployee.mobile);
    add(selectedAdminEmployee.mobileNumber);
    add((selectedAdminEmployee as any).username);
    return set;
  }, [selectedAdminEmployee]);

  const adminEmployeeRecords = useMemo(() => {
    if (selectedAdminEmployeeIdentitySet.size === 0) return [];

    const fromDStr = adminFromDate;
    const toDStr = adminToDate;

    const matchedPunches = (attendanceRecords || []).filter(r => {
      if (!r) return false;
      const recEmpId = String(r.employeeId || '').trim().toUpperCase();
      const recEmpName = String(r.employeeName || '').trim().toUpperCase();
      const isMatch = selectedAdminEmployeeIdentitySet.has(recEmpId) || (recEmpName && selectedAdminEmployeeIdentitySet.has(recEmpName));
      return isMatch && r.date && r.date >= fromDStr && r.date <= toDStr;
    });

    const recordsByDate = new Map<string, any[]>();
    matchedPunches.forEach(r => {
      if (!recordsByDate.has(r.date)) recordsByDate.set(r.date, []);
      recordsByDate.get(r.date)!.push(r);
    });

    // Approved leaves for this employee
    const approvedLeaveDates = new Map<string, any>();
    (leaveRequests || []).forEach((l: any) => {
      const lEmpId = String(l.employeeId || (l as any).employeeID || "").trim().toUpperCase();
      const lEmpName = String(l.employeeName || "").trim().toUpperCase();
      const isMatch = selectedAdminEmployeeIdentitySet.has(lEmpId) || (lEmpName && selectedAdminEmployeeIdentitySet.has(lEmpName));
      if (isMatch && String(l.status).toUpperCase() === 'APPROVED') {
        if (l.fromDate && l.toDate) {
          try {
            let cur = startOfDay(parseISO(l.fromDate));
            const end = startOfDay(parseISO(l.toDate));
            while (!isAfter(cur, end)) {
              approvedLeaveDates.set(format(cur, "yyyy-MM-dd"), l);
              cur = addDays(cur, 1);
            }
          } catch (e) { }
        }
      }
    });

    const fullHistory: any[] = [];
    try {
      let currentD = startOfDay(parseISO(toDStr));
      const startD = startOfDay(parseISO(fromDStr));

      while (!isBefore(currentD, startD)) {
        const dateStr = format(currentD, "yyyy-MM-dd");

        if (recordsByDate.has(dateStr)) {
          // One record per date — take the primary record
          const dayRecords = recordsByDate.get(dateStr)!;
          dayRecords.sort((a, b) => (a.inTime || "").localeCompare(b.inTime || ""));
          fullHistory.push(dayRecords[0]);
        } else {
          const isSun = isSunday(currentD);
          const holidayObj = holidays.find((h: any) => h.date === dateStr);
          const leaveObj = approvedLeaveDates.get(dateStr);

          let displayStatus = isSun ? 'Weekly Off' : 'Absent';
          let attType = holidayObj ? holidayObj.name : 'N/A';
          let inPlant = holidayObj ? holidayObj.name : (isSun ? 'Weekly Off' : 'N/A');
          let remark = holidayObj ? holidayObj.name : (isSun ? 'Weekly Off' : 'Absent');

          if (holidayObj) {
            displayStatus = 'Holiday';
          } else if (leaveObj) {
            displayStatus = 'Leave';
            attType = leaveObj.purpose || 'Approved Leave';
            inPlant = 'On Leave';
            remark = `Approved Leave (${leaveObj.purpose || 'Leave'})`;
          }

          fullHistory.push({
            id: `missing-${dateStr}`,
            employeeName: selectedAdminEmployee?.name || (selectedAdminEmployee as any)?.fullName || selectedAdminEmployee?.firstName || "Employee",
            date: dateStr,
            inTime: null,
            outTime: null,
            hours: 0,
            status: displayStatus,
            attendanceType: attType,
            address: null,
            addressOut: null,
            inPlant: inPlant,
            remark: remark
          });
        }
        currentD = addDays(currentD, -1);
      }
    } catch (e) { }

    return fullHistory;
  }, [selectedAdminEmployeeIdentitySet, adminFromDate, adminToDate, attendanceRecords, leaveRequests, holidays, selectedAdminEmployee]);

  const adminEmployeeStats = useMemo(() => {
    let totalPresent = 0;
    let totalAbsent = 0;
    let totalLeaves = 0;
    let totalHours = 0;

    adminEmployeeRecords.forEach(r => {
      if (r.inTime || r.status === 'Closed' || r.status === 'Open' || r.status === 'Auto OUT') {
        totalPresent++;
        totalHours += Number(r.hours || 0);
      } else if (r.status === 'Leave') {
        totalLeaves++;
      } else if (r.status === 'Absent') {
        totalAbsent++;
      }
    });

    return {
      totalPresent,
      totalAbsent,
      totalLeaves,
      totalHours: formatHoursToHHMM(totalHours)
    };
  }, [adminEmployeeRecords]);

  const filteredEmployeesForAdmin = useMemo(() => {
    if (!adminSearchTerm.trim()) return employees;
    const term = adminSearchTerm.trim().toLowerCase();
    return employees.filter(e => {
      const id = String(e.employeeId || e.id || '').toLowerCase();
      const name = String(e.name || (e as any).fullName || `${e.firstName || ''} ${e.lastName || ''}`).toLowerCase();
      const dept = String(e.department || '').toLowerCase();
      return id.includes(term) || name.includes(term) || dept.includes(term);
    });
  }, [employees, adminSearchTerm]);


  if (!isMounted) return null;

  // =========================================================================
  // VIEW 1: ADMIN & OTHER USER VIEW (READ-ONLY EMPLOYEE ATTENDANCE HISTORY)
  // GATEWAY PORTAL, MARK IN, AND MARK OUT ARE STRICTLY NOT RENDERED
  // =========================================================================
  if (!isEmployeeLogin) {
    return (
      <div className="space-y-8 pb-12 px-4 max-w-7xl mx-auto">
        {/* Page Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200/80 pb-6 pt-2">
          <div>
            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 rounded-2xl bg-slate-900 text-white flex items-center justify-center shadow-md">
                <History className="w-5 h-5 text-amber-400" />
              </div>
              <div>
                <h1 className="text-2xl font-black uppercase tracking-tight text-slate-900">
                  Mark Attendance – Employee History
                </h1>
                <p className="text-xs font-semibold text-slate-500 mt-0.5">
                  Search, filter and inspect employee attendance ledger in read-only mode.
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Badge className="bg-slate-900 text-white text-xs font-black uppercase px-3 py-1.5 rounded-xl">
              Role: {String(verifiedUser?.role || currentUser?.role || 'Admin').replace(/_/g, ' ')}
            </Badge>
            <Badge variant="outline" className="bg-amber-50 text-amber-800 border-amber-300 text-xs font-black uppercase px-3 py-1.5 rounded-xl">
              Read-Only Access
            </Badge>
          </div>
        </div>

        {/* Filter Controls Card */}
        <Card className="rounded-3xl border-slate-200 shadow-sm bg-white overflow-hidden">
          <CardHeader className="bg-slate-50 border-b border-slate-100 py-4 px-6">
            <CardTitle className="text-sm font-black uppercase tracking-wider text-slate-700 flex items-center gap-2">
              <Filter className="w-4 h-4 text-primary" /> Search & Employee Filter
            </CardTitle>
          </CardHeader>
          <CardContent className="p-6">
            <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-4 items-end">
              {/* Employee Selection */}
              <div className="space-y-1.5 md:col-span-2">
                <Label className="text-[10px] font-black uppercase text-slate-500 tracking-wider">
                  Select Employee <span className="text-red-500">*</span>
                </Label>
                <Select value={selectedAdminEmployeeId} onValueChange={setSelectedAdminEmployeeId}>
                  <SelectTrigger className="h-11 rounded-xl border-slate-200 bg-slate-50 text-xs font-bold">
                    <SelectValue placeholder="Choose an employee..." />
                  </SelectTrigger>
                  <SelectContent className="max-h-[300px] rounded-xl shadow-xl">
                    {filteredEmployeesForAdmin.map((emp) => {
                      const empId = emp.employeeId || emp.id || (emp as any)._id;
                      const empName = emp.name || (emp as any).fullName || `${emp.firstName || ''} ${emp.lastName || ''}`.trim();
                      return (
                        <SelectItem key={empId} value={empId} className="text-xs font-semibold py-2.5">
                          <div className="flex items-center justify-between w-full gap-4">
                            <span className="font-bold text-slate-800">[{emp.employeeId || 'ID'}] {empName}</span>
                            <span className="text-[10px] text-slate-400 uppercase font-mono">({emp.department || 'Operations'})</span>
                          </div>
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              </div>

              {/* From Date */}
              <div className="space-y-1.5">
                <Label className="text-[10px] font-black uppercase text-slate-500 tracking-wider">From Date</Label>
                <Input
                  type="date"
                  value={adminFromDate}
                  onChange={(e) => setAdminFromDate(e.target.value)}
                  className="h-11 border-slate-200 bg-slate-50 rounded-xl text-xs font-bold"
                />
              </div>

              {/* To Date */}
              <div className="space-y-1.5">
                <Label className="text-[10px] font-black uppercase text-slate-500 tracking-wider">To Date</Label>
                <Input
                  type="date"
                  value={adminToDate}
                  min={adminFromDate}
                  onChange={(e) => setAdminToDate(e.target.value)}
                  className="h-11 border-slate-200 bg-slate-50 rounded-xl text-xs font-bold"
                />
              </div>
            </div>

            {/* Quick Period Filter Chips */}
            <div className="flex flex-wrap items-center gap-2 pt-4 border-t border-slate-100 mt-5">
              <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider mr-1">Quick Range:</span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 text-[10px] font-black uppercase rounded-lg border-slate-200 hover:bg-slate-100"
                onClick={() => {
                  const now = getISTTime();
                  setAdminFromDate(format(addDays(now, -45), "yyyy-MM-dd"));
                  setAdminToDate(format(now, "yyyy-MM-dd"));
                }}
              >
                Last 45 Days
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 text-[10px] font-black uppercase rounded-lg border-slate-200 hover:bg-slate-100"
                onClick={() => {
                  const now = getISTTime();
                  setAdminFromDate(format(startOfMonth(now), "yyyy-MM-dd"));
                  setAdminToDate(format(now, "yyyy-MM-dd"));
                }}
              >
                This Month
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 text-[10px] font-black uppercase rounded-lg border-slate-200 hover:bg-slate-100"
                onClick={() => {
                  const now = getISTTime();
                  const prevMonth = subMonths(now, 1);
                  setAdminFromDate(format(startOfMonth(prevMonth), "yyyy-MM-dd"));
                  setAdminToDate(format(endOfMonth(prevMonth), "yyyy-MM-dd"));
                }}
              >
                Last Month
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 text-[10px] font-black uppercase rounded-lg border-slate-200 hover:bg-slate-100"
                onClick={() => {
                  setAdminFromDate(currentFYInfo.startDateStr);
                  setAdminToDate(currentFYInfo.endDateStr);
                }}
              >
                {currentFYInfo.label}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Selected Employee Summary Banner & Location Box */}
        {selectedAdminEmployee ? (
          <div className="space-y-6">
            {/* 1. Employee Information Header */}
            <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-200 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 rounded-2xl bg-slate-900 text-white flex items-center justify-center font-black text-2xl shadow-md shrink-0">
                  {(selectedAdminEmployee.name || selectedAdminEmployee.firstName || "E")[0]}
                </div>
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h2 className="text-xl font-black uppercase tracking-tight text-slate-900">
                      {selectedAdminEmployee.name || (selectedAdminEmployee as any).fullName || `${selectedAdminEmployee.firstName || ''} ${selectedAdminEmployee.lastName || ''}`.trim()}
                    </h2>
                    <Badge className="bg-slate-900 text-white font-black text-[10px] uppercase">
                      {selectedAdminEmployee.employeeId}
                    </Badge>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-y-1 sm:gap-x-6 text-xs text-slate-600 font-semibold pt-0.5">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Employee Name:</span>
                      <span className="font-bold text-slate-900 uppercase">{selectedAdminEmployee.name || (selectedAdminEmployee as any).fullName || `${selectedAdminEmployee.firstName || ''} ${selectedAdminEmployee.lastName || ''}`.trim()}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Department:</span>
                      <span className="font-bold text-slate-900 uppercase">{selectedAdminEmployee.department || 'Logistics'}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Mobile:</span>
                      <span className="font-bold text-slate-900">{selectedAdminEmployee.mobile || (selectedAdminEmployee as any).mobileNumber || 'N/A'}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Stats Counters */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 w-full md:w-auto shrink-0">
                <div className="bg-slate-50 rounded-2xl p-3 text-center border border-slate-200 min-w-[85px]">
                  <p className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Present</p>
                  <p className="text-xl font-black text-emerald-600 mt-0.5">{adminEmployeeStats.totalPresent}</p>
                </div>
                <div className="bg-slate-50 rounded-2xl p-3 text-center border border-slate-200 min-w-[85px]">
                  <p className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Absent</p>
                  <p className="text-xl font-black text-rose-600 mt-0.5">{adminEmployeeStats.totalAbsent}</p>
                </div>
                <div className="bg-slate-50 rounded-2xl p-3 text-center border border-slate-200 min-w-[85px]">
                  <p className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Leaves</p>
                  <p className="text-xl font-black text-purple-600 mt-0.5">{adminEmployeeStats.totalLeaves}</p>
                </div>
                <div className="bg-slate-50 rounded-2xl p-3 text-center border border-slate-200 min-w-[85px]">
                  <p className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Hours</p>
                  <p className="text-xl font-black text-amber-600 mt-0.5">{adminEmployeeStats.totalHours}</p>
                </div>
              </div>
            </div>


            {/* Read-Only Attendance History Ledger Table */}
            <Card className="rounded-[1.5rem] overflow-hidden shadow-sm border-slate-200 bg-white">
              <CardHeader className="bg-slate-50/80 border-b border-slate-100 py-4 px-6 flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-base font-black uppercase tracking-tight text-slate-900 flex items-center gap-2">
                    <History className="w-5 h-5 text-primary" /> Attendance History Ledger
                  </CardTitle>
                  <p className="text-xs font-semibold text-slate-500 mt-0.5">
                    Showing records from {formatDate(adminFromDate)} to {formatDate(adminToDate)} ({adminEmployeeRecords.length} day logs)
                  </p>
                </div>
                <Badge variant="outline" className="text-[10px] font-black uppercase px-2.5 py-1 text-slate-600 bg-white">
                  Read-Only Ledger
                </Badge>
              </CardHeader>
              <ScrollArea className="h-[480px]">
                <Table>
                  <TableHeader className="bg-slate-50 sticky top-0 z-10">
                    <TableRow>
                      <TableHead className="font-black uppercase text-[10px]">Date</TableHead>
                      <TableHead className="font-black uppercase text-[10px]">Plant / Type</TableHead>
                      <TableHead className="font-black uppercase text-[10px]">In Time</TableHead>
                      <TableHead className="font-black uppercase text-[10px]">Out Time</TableHead>
                      <TableHead className="font-black uppercase text-[10px] hidden md:table-cell">In Address</TableHead>
                      <TableHead className="font-black uppercase text-[10px] hidden md:table-cell">Out Address</TableHead>
                      <TableHead className="font-black uppercase text-[10px]">Hours</TableHead>
                      <TableHead className="font-black uppercase text-[10px] hidden lg:table-cell">Remarks</TableHead>
                      <TableHead className="font-black uppercase text-[10px] text-right pr-6">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {adminEmployeeRecords.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={9} className="text-center py-16 text-xs font-bold text-slate-400 uppercase tracking-wider">
                          No attendance records found for this date range.
                        </TableCell>
                      </TableRow>
                    ) : (
                      adminEmployeeRecords.map((r: any) => (
                        <TableRow key={r.id || r._id} className="hover:bg-slate-50/50">
                          <TableCell className="py-3.5">
                            <div className="flex flex-col">
                              <span className="text-xs font-bold text-slate-800">{formatDate(r.date)}</span>
                              <span className="text-[10px] font-semibold text-slate-400 mt-0.5">{format(parseISO(r.date), "EEEE")}</span>
                            </div>
                          </TableCell>
                          <TableCell className="text-xs font-bold text-slate-600">
                            {r.inPlant && r.inPlant !== "N/A" ? r.inPlant : (r.attendanceType || "N/A")}
                          </TableCell>
                          <TableCell className="text-xs font-bold text-slate-600">
                            {r.inTime ? formatToReadableISTTime(r.inTime) : "--:--"}
                          </TableCell>
                          <TableCell className="text-xs font-bold text-slate-600">
                            {r.outTime ? formatToReadableISTTime(r.outTime) : "--:--"}
                          </TableCell>
                          <TableCell className="hidden md:table-cell text-[10px] font-medium text-slate-500 max-w-[150px] truncate" title={r.address}>
                            {r.address || "N/A"}
                          </TableCell>
                          <TableCell className="hidden md:table-cell text-[10px] font-medium text-slate-500 max-w-[150px] truncate" title={r.addressOut}>
                            {r.addressOut || "N/A"}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className={cn("font-black text-[10px]", getWorkingHoursColor(r.hours || 0))}>
                              {calculateWorkingHoursHHMM(r.inDate || r.date, r.inTime, r.outDate || r.date, r.outTime, r.hours)}
                            </Badge>
                          </TableCell>
                          <TableCell className="hidden lg:table-cell text-[10px] font-medium text-slate-500 max-w-[140px] truncate" title={r.remark}>
                            {r.remark || "N/A"}
                          </TableCell>
                          <TableCell className="text-right pr-6">
                            <Badge className={cn("text-[9px] font-black uppercase px-2 py-0.5 whitespace-nowrap",
                              r.status === 'Auto OUT' ? "bg-amber-100 text-amber-700 hover:bg-amber-100" :
                                r.status === 'Open' ? "bg-blue-100 text-blue-700 hover:bg-blue-100" :
                                  r.status === 'Absent' ? "bg-rose-100 text-rose-700 hover:bg-rose-100" :
                                    r.status === 'Leave' ? "bg-purple-100 text-purple-700 hover:bg-purple-100" :
                                      (r.status === 'Weekly Off' || r.status === 'Holiday') ? "bg-slate-100 text-slate-700 hover:bg-slate-100" :
                                        "bg-emerald-100 text-emerald-700 hover:bg-emerald-100"
                            )}>
                              {r.status === 'Open' ? 'Active Shift' :
                                r.status === 'Closed' ? 'Completed Shift' :
                                  r.status === 'Auto OUT' ? 'Auto Closed' :
                                    r.status === 'Leave' ? 'Approved Leave' :
                                      r.status}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </ScrollArea>
            </Card>
          </div>
        ) : (
          <div className="py-20 text-center text-slate-400 bg-white rounded-3xl border border-slate-200 shadow-sm">
            <User className="w-12 h-12 text-slate-300 mx-auto mb-3" />
            <p className="text-sm font-bold text-slate-600">Please select an employee to view attendance history.</p>
          </div>
        )}
      </div>
    );
  }

  // =========================================================================
  // VIEW 2: EMPLOYEE VIEW (GATEWAY PORTAL, MARK IN / OUT & OWN HISTORY)
  // ONLY AUTHENTICATED EMPLOYEES CAN SEE & ACCESS THIS VIEW
  // =========================================================================
  return (
    <div className="space-y-6 pb-8 w-full mx-auto">
      {/* 0. GATEWAY PORTAL (MARK IN / MARK OUT) - STRICTLY FOR EMPLOYEE */}
      <div className="w-full space-y-6">
        {(locationPermissionStatus === "denied" || locationPermissionStatus === "unavailable" || locationPermissionMessage) && (
          <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl flex flex-col sm:flex-row items-center justify-between gap-3 shadow-sm text-amber-900 animate-in fade-in">
            <div className="flex items-center gap-3">
              <MapPin className="w-5 h-5 text-amber-600 shrink-0" />
              <span className="text-xs font-black uppercase tracking-wide">
                {t.locationPermissionRequired}
              </span>
            </div>
            <Button
              size="sm"
              className="bg-amber-600 hover:bg-amber-700 text-white font-black text-xs uppercase px-4 h-9 rounded-xl shrink-0"
              onClick={() => checkLocationOnMount(true)}
            >
              {t.allowLocation}
            </Button>
          </div>
        )}

        <Card className="shadow-2xl border-none overflow-hidden bg-white">
          <div className="h-1.5 bg-primary" />
          <CardHeader className="text-center py-5 sm:py-6 relative bg-slate-50/50 border-b border-slate-100 px-4">
            <div className="space-y-1">
              <span className="text-[10px] font-black uppercase tracking-[0.25em] text-primary bg-primary/10 px-3 py-1 rounded-full">
                {t.gatewayPortal}
              </span>
              <CardTitle className="text-xl font-black flex items-center justify-center gap-2 text-slate-900 uppercase tracking-tight pt-1">
                <ShieldCheck className="text-primary w-5 h-5" /> {t.markAttendance}
              </CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-6 px-4 sm:px-8 pb-8 pt-6">
            {/* Employee Identification Card */}
            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-2">
              <div className="flex items-center justify-between border-b border-slate-200/80 pb-2">
                <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider">{t.employeeName}</span>
                <span className="text-xs font-black text-slate-900 uppercase">{effectiveEmployeeName} ({effectiveEmployeeId})</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider">{t.currentLocation}</span>
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-bold text-slate-700 text-right max-w-[240px] truncate" title={detectedAddress}>
                    {detectedAddress || t.capturingAddress}
                  </span>
                  <button
                    type="button"
                    title="Refresh Location"
                    onClick={() => checkLocationOnMount(true)}
                    className="p-1 hover:bg-slate-200 rounded-lg text-slate-500 hover:text-slate-800 transition-colors"
                  >
                    <RefreshCw className={cn("w-3.5 h-3.5", locationPermissionStatus === "checking" && "animate-spin")} />
                  </button>
                </div>
              </div>
            </div>

            {/* Live Clock Display */}
            <div className="py-6 px-8 sm:px-10 rounded-[2.5rem] bg-slate-50 text-slate-900 flex flex-col items-center justify-center space-y-1 shadow-inner border border-slate-100 max-w-[300px] mx-auto group hover:bg-primary/5 transition-colors" suppressHydrationWarning>
              {currentTime ? (
                <div className="text-center" suppressHydrationWarning>
                  <h2 className="text-[50px] sm:text-[55px] font-black tracking-tighter font-mono leading-none text-slate-900" suppressHydrationWarning>{format(currentTime, "HH:mm")}</h2>
                  <p className="text-[11px] font-black text-primary mt-3 flex items-center justify-center gap-1.5 uppercase tracking-[0.2em]" suppressHydrationWarning>{format(currentTime, "dd MMM yyyy")}</p>
                </div>
              ) : (
                <Loader2 className="w-10 h-10 text-slate-200 animate-spin" />
              )}
            </div>

            {/* Internet Connectivity Status (Requirement 1) */}
            {!isOnline && (
              <div className="p-4 bg-rose-50 border border-rose-300 rounded-2xl text-rose-900 shadow-sm flex items-center gap-3 animate-in fade-in">
                <WifiOff className="w-5 h-5 text-rose-600 shrink-0" />
                <div className="text-left">
                  <p className="text-xs font-black uppercase tracking-tight text-rose-900">
                    Connection Required
                  </p>
                  <p className="text-xs font-bold text-rose-700 mt-0.5">
                    You aren’t connected with internet. Please connect your device with internet
                  </p>
                </div>
              </div>
            )}

            {/* Already Marked IN Today Alert */}
            {hasMarkedInToday && !activeRecord && (
              <div className="p-4 bg-amber-50 border border-amber-300 rounded-2xl text-amber-900 shadow-sm flex items-center gap-3 animate-in fade-in">
                <CheckCircle className="w-5 h-5 text-amber-600 shrink-0" />
                <div className="text-left">
                  <p className="text-xs font-black uppercase tracking-tight text-amber-900">
                    Attendance Completed for Today
                  </p>
                  <p className="text-xs font-bold text-amber-700 mt-0.5">
                    You can mark IN again from tomorrow onwards.
                  </p>
                </div>
              </div>
            )}

            {activeRecord && !canMarkOut && nextOutAvailableAt && (
              <div className="p-4 bg-[#FFFDE7] rounded-2xl border border-amber-200 text-amber-800 animate-in fade-in max-w-md mx-auto w-full text-left shadow-sm" suppressHydrationWarning>
                <p className="text-xs font-black uppercase tracking-tight text-amber-900" suppressHydrationWarning>
                  {(() => {
                    const startDT = (activeRecord.inDate && activeRecord.inTime)
                      ? parseDateTime(activeRecord.inDate, activeRecord.inTime)
                      : (activeRecord.date && activeRecord.inTime)
                        ? parseDateTime(activeRecord.date, activeRecord.inTime)
                        : (activeRecord.inDateTime ? parseISO(activeRecord.inDateTime) : null);
                    const formatted = startDT && isValid(startDT)
                      ? format(startDT, "dd-MMM, hh:mm a")
                      : `${activeRecord.inDate || activeRecord.date || 'Today'}, ${activeRecord.inTime}`;
                    return t.activeShiftSince(activeRecord.sessionIndex || 1, formatted);
                  })()}
                </p>
                <p className="text-[11px] font-bold text-amber-700 mt-1 leading-relaxed" suppressHydrationWarning>
                  {t.markOutAvailableAt(format(nextOutAvailableAt, "dd-MMM-yyyy HH:mm"))} • {activeRecord.sessionIndex === 2 ? t.autoOutThreshold8h : t.autoOutThreshold16h}
                </p>
              </div>
            )}

            {/* Mark IN & Mark OUT Action Buttons */}
            <div className="flex gap-3 sm:gap-4">
              {/* Mark IN: Disabled if already marked in today or shift is open */}
              <Button
                type="button"
                className={cn("flex-1 h-16 text-sm font-black rounded-2xl shadow-xl transition-all uppercase tracking-widest",
                  (!isOnline || !!activeRecord || hasMarkedInToday) ? "bg-slate-100 text-slate-400" : "bg-primary text-white shadow-primary/20 hover:bg-primary/90"
                )}
                disabled={!isOnline || isLoadingLocation || isMutatingAttendance || !!activeRecord || hasMarkedInToday}
                onClick={handleMarkInClick}
              >
                {isMutatingAttendance ? (
                  <span className="flex items-center gap-2"><Loader2 className="w-5 h-5 animate-spin" /> Processing...</span>
                ) : isLoadingLocation && activeDialog === 'NONE' ? (
                  <span className="flex items-center gap-2"><Loader2 className="w-5 h-5 animate-spin" /> {t.fetchingGps}</span>
                ) : !isOnline ? (
                  "Offline"
                ) : hasMarkedInToday && !activeRecord ? (
                  "Marked IN ✓"
                ) : (
                  t.markIn
                )}
              </Button>
              {/* Mark OUT: Enabled only when there is an active open shift */}
              <Button
                type="button"
                className={cn(
                  "flex-1 h-16 text-sm font-black rounded-2xl shadow-xl transition-all uppercase tracking-widest",
                  (!isOnline || !activeRecord || !canMarkOut) ? "bg-slate-100 text-slate-400" : "bg-rose-600 text-white shadow-rose-200 hover:bg-rose-700"
                )}
                disabled={!isOnline || isLoadingLocation || isMutatingAttendance || !activeRecord || !canMarkOut}
                onClick={handleMarkOutClick}
              >
                {isMutatingAttendance ? (
                  <span className="flex items-center gap-2"><Loader2 className="w-5 h-5 animate-spin" /> Processing...</span>
                ) : !isOnline ? (
                  "Offline"
                ) : isLoadingLocation && activeDialog === 'NONE' ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin mr-2" />
                    {t.markOut}
                  </>
                ) : (
                  t.markOut
                )}
              </Button>
            </div>

            {/* Attendance Status Footer */}
            <div className="pt-6 border-t border-slate-100 flex flex-col items-center justify-center w-full">
              {activeRecord ? (
                <div className="w-full space-y-3">
                  <div className="flex items-center justify-center gap-2 px-5 py-3 rounded-xl w-full border font-black text-sm uppercase tracking-wider text-emerald-600 bg-emerald-50 border-emerald-100">
                    <ShieldCheck className="w-4 h-4 text-emerald-600" />
                    <span>Active Shift In Progress — Mark OUT when done</span>
                  </div>

                  <div className="flex items-center justify-center gap-2 text-slate-600 bg-[#F8F9FA] px-5 py-2.5 rounded-xl w-full border border-slate-200 shadow-sm font-black uppercase tracking-wider text-xs">
                    <Clock className="w-4 h-4 text-slate-500" />
                    <span>
                      {(() => {
                        const startDT = (activeRecord.inDate && activeRecord.inTime)
                          ? parseDateTime(activeRecord.inDate, activeRecord.inTime)
                          : (activeRecord.date && activeRecord.inTime)
                            ? parseDateTime(activeRecord.date, activeRecord.inTime)
                            : (activeRecord.inDateTime ? parseISO(activeRecord.inDateTime) : null);
                        const dateFormatted = startDT && isValid(startDT) ? format(startDT, "dd-MMM-yyyy") : (activeRecord.inDate || activeRecord.date || format(getISTTime(), "dd-MMM-yyyy"));
                        return `${t.shiftStarted(dateFormatted, activeRecord.inTime || "--:--")} • ${t.maxAutoOut16h}`;
                      })()}
                    </span>
                  </div>
                </div>
              ) : hasMarkedInToday ? (
                <div className="flex items-center justify-center gap-2 text-emerald-700 bg-emerald-50 px-5 py-3 rounded-xl w-full border border-emerald-200">
                  <CheckCircle className="w-5 h-5" />
                  <span className="text-sm font-black uppercase tracking-wider">
                    Attendance Completed — {formatHoursToHHMM(todayRecord?.hours || 0)} worked
                  </span>
                </div>
              ) : (
                <div className="flex items-center justify-center gap-2 text-slate-500 bg-slate-50 px-5 py-3 rounded-xl w-full border border-slate-200">
                  <Clock className="w-5 h-5" />
                  <span className="text-sm font-black uppercase tracking-wider">{t.eligibleForMarkIn}</span>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 1. SESSION HISTORY & 2. MONTHLY SUMMARY - STRICTLY FOR LOGGED-IN EMPLOYEE */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* SESSION HISTORY (LAST 62 DAYS) */}
        <div className="lg:col-span-2 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-2">
            <div>
              <h3 className="font-black text-lg flex items-center gap-2 text-slate-800 uppercase tracking-tight">
                <History className="w-5 h-5 text-primary" /> {t.myAttendanceHistory}
              </h3>
              <p className="text-xs font-semibold text-slate-500 mt-0.5">
                {t.displayingDays(formatDate(dateWindow62Days.startDateStr), formatDate(dateWindow62Days.todayStr))}
              </p>
            </div>
            <Badge variant="outline" className="text-[10px] font-black uppercase px-2.5 py-1 text-slate-600 border-slate-300 w-fit bg-white">
              {t.rolling62Days}
            </Badge>
          </div>

          <Card className="rounded-[1.5rem] overflow-hidden shadow-sm border-slate-200 bg-white">
            <ScrollArea className="h-[430px] w-full">
              {isLoading && employeeRecords.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 space-y-3">
                  <Loader2 className="w-8 h-8 text-primary animate-spin" />
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">{t.syncingHistory}</p>
                </div>
              ) : (
                <div className="overflow-x-auto w-full">
                  <Table className="min-w-[550px] w-full">
                    <TableHeader className="bg-slate-50 sticky top-0 z-10">
                      <TableRow>
                        <TableHead className="font-black uppercase text-[10px]">{t.date}</TableHead>
                        <TableHead className="font-black uppercase text-[10px]">{t.plantType}</TableHead>
                        <TableHead className="font-black uppercase text-[10px]">{t.inTime}</TableHead>
                        <TableHead className="font-black uppercase text-[10px]">{t.outTime}</TableHead>
                        <TableHead className="font-black uppercase text-[10px] hidden md:table-cell">{t.inAddress}</TableHead>
                        <TableHead className="font-black uppercase text-[10px] hidden md:table-cell">{t.outAddress}</TableHead>
                        <TableHead className="font-black uppercase text-[10px]">{t.workingHours}</TableHead>
                        <TableHead className="font-black uppercase text-[10px] hidden lg:table-cell">{t.remarks}</TableHead>
                        <TableHead className="font-black uppercase text-[10px] text-right pr-4">{t.status}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {employeeRecords.map((r: any) => (
                        <TableRow key={r.id || r._id} className="hover:bg-slate-50/50">
                          <TableCell className="py-3.5">
                            <div className="flex flex-col">
                              <span className="text-xs font-bold text-slate-800">{formatDate(r.date)}</span>
                              <span className="text-[10px] font-semibold text-slate-400 mt-0.5">{format(parseISO(r.date), "EEEE")}</span>
                            </div>
                          </TableCell>
                          <TableCell className="text-xs font-bold text-slate-600">
                            {r.inPlant && r.inPlant !== "N/A" ? r.inPlant : (r.attendanceType === 'WFH' ? t.workFromHome : r.attendanceType === 'FIELD' ? t.fieldWork : (r.attendanceType || "N/A"))}
                          </TableCell>
                          <TableCell className="text-xs font-bold text-slate-600">
                            {r.inTime ? formatToReadableISTTime(r.inTime) : "--:--"}
                          </TableCell>
                          <TableCell className="text-xs font-bold text-slate-600">
                            {r.outTime ? formatToReadableISTTime(r.outTime) : "--:--"}
                          </TableCell>
                          <TableCell className="hidden md:table-cell text-[10px] font-medium text-slate-500 max-w-[140px] truncate" title={r.address}>
                            {r.address || "N/A"}
                          </TableCell>
                          <TableCell className="hidden md:table-cell text-[10px] font-medium text-slate-500 max-w-[140px] truncate" title={r.addressOut}>
                            {r.addressOut || "N/A"}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className={cn("font-black text-[10px]", getWorkingHoursColor(r.hours || 0))}>
                              {calculateWorkingHoursHHMM(r.inDate || r.date, r.inTime, r.outDate || r.date, r.outTime, r.hours)}
                            </Badge>
                          </TableCell>
                          <TableCell className="hidden lg:table-cell text-[10px] font-medium text-slate-500 max-w-[130px] truncate" title={r.remark}>
                            {r.remark || "N/A"}
                          </TableCell>
                          <TableCell className="text-right pr-4">
                            <Badge className={cn("text-[9px] font-black uppercase px-2 py-0.5 whitespace-nowrap",
                              r.status === 'Auto OUT' ? "bg-amber-100 text-amber-700 hover:bg-amber-100" :
                                r.status === 'Open' ? "bg-blue-100 text-blue-700 hover:bg-blue-100" :
                                  r.status === 'Absent' ? "bg-rose-100 text-rose-700 hover:bg-rose-100" :
                                    r.status === 'Leave' ? "bg-purple-100 text-purple-700 hover:bg-purple-100" :
                                      (r.status === 'Weekly Off' || r.status === 'Holiday') ? "bg-slate-100 text-slate-700 hover:bg-slate-100" :
                                        "bg-emerald-100 text-emerald-700 hover:bg-emerald-100"
                            )}>
                              {r.status === 'Open' ? t.statusActiveShift :
                                r.status === 'Closed' ? t.statusCompletedShift :
                                  r.status === 'Auto OUT' ? t.statusAutoClosedShift :
                                    r.status === 'Leave' ? t.statusApprovedLeave :
                                      r.status === 'Weekly Off' ? t.statusWeeklyOff :
                                        r.status === 'Holiday' ? t.statusHoliday :
                                          r.status === 'Absent' ? t.statusAbsent :
                                            r.status === 'Present' ? t.statusPresent :
                                              r.status}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </ScrollArea>
          </Card>
        </div>

        {/* MONTHLY SUMMARY (CURRENT & PREVIOUS 2 MONTHS) */}
        <div className="lg:col-span-1 space-y-4">
          <div className="pt-2">
            <h3 className="font-black text-lg flex items-center gap-2 text-slate-800 uppercase tracking-tight">
              <Calendar className="w-5 h-5 text-primary" /> {t.monthlySummary}
            </h3>
            <p className="text-xs font-semibold text-slate-500 mt-0.5">
              {t.currentAndPreviousMonths}
            </p>
          </div>

          <div className="space-y-4">
            <Card className="rounded-[1.5rem] overflow-hidden shadow-sm border-slate-200 bg-white">
              <div className="overflow-x-auto w-full">
                <Table className="w-full">
                  <TableHeader className="bg-slate-50">
                    <TableRow>
                      <TableHead className="font-black uppercase text-[10px]">{t.month}</TableHead>
                      <TableHead className="font-black uppercase text-[10px] text-right">{t.present}</TableHead>
                      <TableHead className="font-black uppercase text-[10px] text-right">{t.leave}</TableHead>
                      <TableHead className="font-black uppercase text-[10px] text-right">{t.absent}</TableHead>
                      <TableHead className="font-black uppercase text-[10px] text-right">{t.worked}</TableHead>
                      <TableHead className="font-black uppercase text-[10px] text-right pr-4">{t.rank}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {monthlySummaries.map((summary, idx) => (
                      <TableRow key={idx} className="hover:bg-slate-50/50">
                        <TableCell className="font-bold text-xs text-slate-800 py-3">{summary.monthYear}</TableCell>
                        <TableCell className="font-black text-xs text-emerald-600 text-right">{summary.present}</TableCell>
                        <TableCell className="font-black text-xs text-amber-600 text-right">{summary.leave}</TableCell>
                        <TableCell className="font-black text-xs text-rose-600 text-right">{summary.absent}</TableCell>
                        <TableCell className="font-black text-xs text-slate-600 text-right">{summary.workedHours}</TableCell>
                        <TableCell className="font-black text-xs text-primary text-right pr-4">
                          {monthlyRanks[summary.monthKey]
                            ? toOrdinal(monthlyRanks[summary.monthKey])
                            : <span className="text-slate-400 text-xs">—</span>}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </Card>
          </div>
        </div>
      </div>

      {/* 3. LEAVE REQUEST & LEAVE HISTORY (CURRENT FINANCIAL YEAR & APPROVED RECORDS ONLY) */}
      <div className="space-y-4 pt-4">
        {/* Leave Request Action Button Bar Above Leave History */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 sm:p-5 bg-white border border-slate-200 rounded-3xl shadow-sm">
          <div className="space-y-0.5">
            <h4 className="text-sm font-black uppercase text-slate-900 tracking-tight flex items-center gap-2">
              <CalendarDays className="w-4 h-4 text-primary" /> {t.applyForLeave}
            </h4>
            <p className="text-xs font-medium text-slate-500">
              {t.submitLeaveDesc}
            </p>
          </div>
          <LeaveRequestForm t={t} />
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-2">
          <div>
            <h3 className="font-black text-lg flex items-center gap-2 text-slate-800 uppercase tracking-tight">
              <History className="w-5 h-5 text-primary" /> {t.leaveHistory(currentFYInfo.label)}
            </h3>
            <p className="text-xs font-semibold text-slate-500 mt-0.5">
              {t.monthWiseApprovedLeaves(formatDate(currentFYInfo.startDateStr), formatDate(currentFYInfo.endDateStr))}
            </p>
          </div>
          <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100 text-[10px] font-black uppercase px-2.5 py-1 border border-emerald-200 w-fit">
            {t.approvedRecordsOnly}
          </Badge>
        </div>

        {fyMonthWiseLeaves.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {fyMonthWiseLeaves.map((group) => (
              <div
                key={group.monthKey}
                className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm flex flex-col justify-between hover:border-primary/40 transition-colors"
              >
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">{group.monthLabel}</span>
                <div className="mt-2 flex items-baseline justify-between">
                  <span className="text-xl font-black text-slate-900">{group.totalLeaveDays}</span>
                  <span className="text-xs font-black text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-lg border border-emerald-100 uppercase">
                    {group.totalLeaveDays} {t.leavesUnit}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}

        <Card className="rounded-[1.5rem] overflow-hidden shadow-sm border-slate-200 bg-white">
          <div className="overflow-x-auto w-full">
            <Table className="min-w-[550px] w-full">
              <TableHeader className="bg-slate-50">
                <TableRow>
                  <TableHead className="font-black uppercase text-[10px]">{t.month}</TableHead>
                  <TableHead className="font-black uppercase text-[10px]">{t.totalLeave}</TableHead>
                  <TableHead className="font-black uppercase text-[10px]">{t.leaveDates}</TableHead>
                  <TableHead className="font-black uppercase text-[10px]">{t.leavePurpose}</TableHead>
                  <TableHead className="font-black uppercase text-[10px] hidden md:table-cell">{t.remarks}</TableHead>
                  <TableHead className="font-black uppercase text-[10px] text-right">{t.status}</TableHead>
                  <TableHead className="font-black uppercase text-[10px] text-right pr-4">{t.approvedBy}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {fyMonthWiseLeaves.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-12 text-xs font-bold text-slate-400 uppercase tracking-wider">
                      {t.noApprovedLeaves(currentFYInfo.label)}
                    </TableCell>
                  </TableRow>
                ) : (
                  fyMonthWiseLeaves.map((group) => (
                    group.records.map((leave: any, rIdx: number) => (
                      <TableRow key={`${group.monthKey}-${leave.id || leave._id || rIdx}`} className="hover:bg-slate-50/50">
                        <TableCell className="font-bold text-xs text-slate-800 py-3.5">
                          {rIdx === 0 ? (
                            <span className="font-black text-slate-900 bg-slate-100 px-2.5 py-1 rounded-lg">
                              {group.monthLabel}
                            </span>
                          ) : (
                            <span className="text-slate-400 text-[10px] italic pl-2">↳ {group.monthLabel}</span>
                          )}
                        </TableCell>
                        <TableCell className="text-xs font-black text-emerald-700">
                          {rIdx === 0 ? `${group.totalLeaveDays} ${t.leavesUnit}` : `${leave.daysInThisMonth || leave.days} ${t.daysUnit}`}
                        </TableCell>
                        <TableCell className="text-xs font-bold text-slate-600">
                          {formatDate(leave.fromDate)} – {formatDate(leave.toDate)}
                        </TableCell>
                        <TableCell className="text-xs font-bold text-slate-700">
                          {leave.purpose || "Leave"}
                        </TableCell>
                        <TableCell className="hidden md:table-cell text-[11px] font-medium text-slate-500 max-w-[180px] truncate" title={leave.remark}>
                          {leave.remark || "-"}
                        </TableCell>
                        <TableCell className="text-right">
                          <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100 border border-emerald-200 text-[9px] font-black uppercase px-2 py-0.5 whitespace-nowrap">
                            {t.statusApproved}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-[10px] font-bold text-slate-600 uppercase font-mono text-right pr-4">
                          {leave.processedByUserId || leave.approvedBy || "Admin"}
                        </TableCell>
                      </TableRow>
                    ))
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </Card>
      </div>

      {/* Mark IN Confirmation Pop-up with Location and Distance */}
      <Dialog
        open={activeDialog === "IN"}
        onOpenChange={(o) => {
          if (!o) {
            clearActiveWatch();
            setActiveDialog("NONE");
            setIsLoadingLocation(false);
          }
        }}
      >
        <DialogContent className="sm:max-w-xl rounded-[2.5rem] overflow-hidden p-0 border-none shadow-2xl">
          <DialogHeader className="p-7 bg-slate-900 text-white shrink-0">
            <div className="flex items-center justify-between gap-2">
              <DialogTitle className="flex items-center gap-2 text-lg font-black uppercase tracking-tight">
                <MapPin className="w-5 h-5 text-primary" /> {t.markInConfirmation}
              </DialogTitle>
              <Badge className="bg-primary/30 text-primary-foreground text-[10px] font-black uppercase px-2.5 py-1 rounded-lg">
                Mark IN
              </Badge>
            </div>
          </DialogHeader>
          <div className="p-8 space-y-5">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-[10px] font-black uppercase text-slate-400 tracking-widest">{t.employeeName}</Label>
                <p className="text-sm font-black text-slate-900 uppercase mt-0.5">{effectiveEmployeeName}</p>
              </div>

              <div>
                <Label className="text-[10px] font-black uppercase text-slate-400 tracking-widest">{t.dateAndTime}</Label>
                <p className="text-sm font-bold text-slate-700 mt-0.5">
                  {format(currentTime || getISTTime(), "dd-MMM-yyyy hh:mm:ss a")}
                </p>
              </div>
            </div>

            {/* Current GPS Location / Address */}
            <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100 shadow-inner">
              <Label className="text-[10px] font-black uppercase text-primary tracking-widest flex items-center gap-2 mb-2">
                <Navigation className="w-3.5 h-3.5" /> {t.currentLocationGps}
              </Label>
              <div className="text-xs font-bold text-slate-700">
                <span className="text-slate-800 whitespace-normal break-words leading-relaxed">
                  {detectedAddress || (
                    <span className="text-slate-400 flex items-center gap-1.5 font-medium italic">
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" /> {t.capturingAddressBounds}
                    </span>
                  )}
                </span>
              </div>
            </div>

            {/* Attendance Category Selection (if outside registered plant bounds) */}
            {!detectedPlant && (
              <div className="space-y-2 pt-1">
                <Label className="text-[10px] font-black uppercase text-slate-500 tracking-wider">
                  {t.selectAttendanceMode}
                </Label>
                <RadioGroup value={selectedType} onValueChange={(v: any) => setSelectedType(v)} className="grid grid-cols-2 gap-3">
                  <div
                    className={cn(
                      "p-4 border-2 rounded-2xl cursor-pointer transition-all flex flex-col items-center gap-2",
                      selectedType === 'WFH' ? "border-primary bg-primary/5 shadow-md shadow-primary/5" : "border-slate-200 bg-white hover:border-slate-300"
                    )}
                    onClick={() => setSelectedType('WFH')}
                  >
                    <Home className={cn("w-6 h-6", selectedType === 'WFH' ? "text-primary" : "text-slate-400")} />
                    <span className="font-black text-[10px] uppercase tracking-wider text-slate-800">{t.workFromHome}</span>
                  </div>
                  <div
                    className={cn(
                      "p-4 border-2 rounded-2xl cursor-pointer transition-all flex flex-col items-center gap-2",
                      selectedType === 'FIELD' ? "border-primary bg-primary/5 shadow-md shadow-primary/5" : "border-slate-200 bg-white hover:border-slate-300"
                    )}
                    onClick={() => setSelectedType('FIELD')}
                  >
                    <Briefcase className={cn("w-6 h-6", selectedType === 'FIELD' ? "text-primary" : "text-slate-400")} />
                    <span className="font-black text-[10px] uppercase tracking-wider text-slate-800">{t.fieldWork}</span>
                  </div>
                </RadioGroup>
              </div>
            )}

            <div className="flex items-center justify-between text-[10px] font-bold text-slate-400 pt-1 border-t border-slate-100">
              <span>{t.gpsAccuracy}: {gpsAccuracy ? `${gpsAccuracy.toFixed(1)} ${t.metersUnit}` : "N/A"}</span>
              <span>{t.coordinates}: {currentGPS ? `${currentGPS.lat.toFixed(4)}, ${currentGPS.lng.toFixed(4)}` : "N/A"}</span>
            </div>
          </div>
          <DialogFooter className="p-6 bg-slate-50 border-t flex flex-row gap-3">
            <Button
              type="button"
              variant="outline"
              className="flex-1 h-12 font-black rounded-xl text-slate-700 border-slate-300 uppercase tracking-wider text-xs"
              onClick={() => { clearActiveWatch(); setActiveDialog("NONE"); setIsLoadingLocation(false); }}
            >
              {t.cancel}
            </Button>
            <Button
              type="button"
              className={cn(
                "flex-1 h-12 font-black rounded-xl uppercase tracking-wider text-xs shadow-lg transition-all",
                (!detectedAddress || (!detectedPlant && !selectedType))
                  ? "bg-slate-200 text-slate-400 cursor-not-allowed shadow-none"
                  : "bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-600/20"
              )}
              onClick={handleConfirmCheckIn}
              disabled={
                isMutatingAttendance ||
                !detectedAddress ||
                (!detectedPlant && !selectedType)
              }
            >
              {isMutatingAttendance ? (
                <span className="flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" /> {t.processing}
                </span>
              ) : (
                t.confirmAndMarkIn
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Mark OUT Confirmation Pop-up */}
      <Dialog
        open={activeDialog === "OUT"}
        onOpenChange={(o) => {
          if (!o) {
            clearActiveWatch();
            setActiveDialog("NONE");
            setIsLoadingLocation(false);
          }
        }}
      >
        <DialogContent className="sm:max-w-xl rounded-[2.5rem] overflow-hidden p-0 border-none shadow-2xl">
          <DialogHeader className="p-7 bg-rose-600 text-white shrink-0">
            <DialogTitle className="flex items-center gap-2 text-lg font-black uppercase tracking-tight">
              <Navigation className="w-5 h-5" /> {t.markOutConfirmation}
            </DialogTitle>
          </DialogHeader>
          <div className="p-8 space-y-5">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-[10px] font-black uppercase text-slate-400 tracking-widest">{t.employeeName}</Label>
                <p className="text-sm font-black text-slate-900 uppercase mt-0.5">{effectiveEmployeeName}</p>
              </div>

              <div>
                <Label className="text-[10px] font-black uppercase text-slate-400 tracking-widest">{t.dateAndTime}</Label>
                <p className="text-sm font-bold text-slate-700 mt-0.5">
                  {format(currentTime || getISTTime(), "dd-MMM-yyyy hh:mm:ss a")}
                </p>
              </div>
            </div>

            {activeRecord && (
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-center gap-2 font-black text-slate-700 uppercase tracking-wider text-xs">
                <ShieldCheck className="w-4 h-4 text-slate-500" />
                <span>
                  {(() => {
                    const startDT = (activeRecord.inDate && activeRecord.inTime)
                      ? parseDateTime(activeRecord.inDate, activeRecord.inTime)
                      : (activeRecord.date && activeRecord.inTime)
                        ? parseDateTime(activeRecord.date, activeRecord.inTime)
                        : (activeRecord.inDateTime ? parseISO(activeRecord.inDateTime) : null);
                    const dateFormatted = startDT && isValid(startDT) ? format(startDT, "dd-MMM-yyyy") : (activeRecord.inDate || activeRecord.date || format(getISTTime(), "dd-MMM-yyyy"));
                    return t.shiftStarted(dateFormatted, activeRecord.inTime || "--:--");
                  })()}
                </span>
              </div>
            )}

            {/* Current GPS Location / Address */}
            <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100 shadow-inner">
              <Label className="text-[10px] font-black uppercase text-rose-500 tracking-widest flex items-center gap-2 mb-2">
                <MapPin className="w-3.5 h-3.5" /> {t.currentLocationGps}
              </Label>
              <div className="text-xs font-bold text-slate-700">
                <span className="text-slate-800 whitespace-normal break-words leading-relaxed">
                  {detectedAddress || (
                    <span className="text-slate-400 flex items-center gap-1.5 font-medium italic">
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" /> {t.fetchingAddress}
                    </span>
                  )}
                </span>
              </div>
            </div>

            <div className="flex items-center justify-between text-[10px] font-bold text-slate-400 pt-1 border-t border-slate-100">
              <span>{t.gpsAccuracy}: {gpsAccuracy ? `${gpsAccuracy.toFixed(1)} ${t.metersUnit}` : "N/A"}</span>
              <span>{t.coordinates}: {currentGPS ? `${currentGPS.lat.toFixed(4)}, ${currentGPS.lng.toFixed(4)}` : "N/A"}</span>
            </div>
          </div>
          <DialogFooter className="p-6 bg-slate-50 border-t flex flex-row gap-3">
            <Button
              type="button"
              variant="outline"
              className="flex-1 h-12 font-black rounded-xl text-slate-700 border-slate-300 uppercase tracking-wider text-xs"
              onClick={() => { clearActiveWatch(); setActiveDialog("NONE"); setIsLoadingLocation(false); }}
            >
              {t.cancel}
            </Button>
            <Button
              type="button"
              className="flex-1 h-12 font-black bg-rose-600 hover:bg-rose-700 text-white rounded-xl shadow-lg shadow-rose-600/20 uppercase tracking-wider text-xs"
              onClick={handleConfirmCheckOut}
              disabled={isMutatingAttendance || !canMarkOut}
            >
              {isMutatingAttendance ? (
                <span className="flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" /> {t.processing}
                </span>
              ) : t.confirmAndMarkOut}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}