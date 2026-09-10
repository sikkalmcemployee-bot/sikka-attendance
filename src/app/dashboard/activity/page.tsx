"use client";

import { useState, useEffect, useCallback } from "react";
import { 
  Table, 
  TableHeader, 
  TableBody, 
  TableRow, 
  TableHead, 
  TableCell 
} from "@/components/ui/table";
import { Card, CardHeader, CardContent, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogFooter
} from "@/components/ui/dialog";
import { 
  Search, 
  Smartphone, 
  History, 
  User as UserIcon, 
  SmartphoneNfc, 
  MonitorSmartphone,
  ChevronLeft,
  ChevronRight,
  RefreshCw
} from "lucide-react";
import { useData } from "@/context/data-context";
import { cn } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";

const PAGE_SIZE = 15;

export default function ActivityPage() {
  const { employees = [] } = useData();
  const { toast } = useToast();

  const [isMounted, setIsMounted] = useState(false);

  // ═════════════════════════════════════════════════════════════
  // DEVICE REGISTRY (Server-Side Pagination)
  // ═════════════════════════════════════════════════════════════
  const [deviceItems, setDeviceItems] = useState<any[]>([]);
  const [devicePage, setDevicePage] = useState<number>(1);
  const [deviceTotal, setDeviceTotal] = useState<number>(0);
  const [deviceTotalPages, setDeviceTotalPages] = useState<number>(1);
  const [deviceSearchTerm, setDeviceSearchTerm] = useState<string>("");
  const [deviceLoading, setDeviceLoading] = useState<boolean>(false);
  const [jumpDevicePage, setJumpDevicePage] = useState<string>("1");
  const [selectedEmployee, setSelectedEmployee] = useState<any>(null);
  const [deviceStats, setDeviceStats] = useState<{
    totalEmployees: number;
    registeredCount: number;
    notRegisteredCount: number;
    activeCount: number;
    inactiveCount: number;
    permissionDisabledCount: number;
  }>({
    totalEmployees: 0,
    registeredCount: 0,
    notRegisteredCount: 0,
    activeCount: 0,
    inactiveCount: 0,
    permissionDisabledCount: 0,
  });

  useEffect(() => {
    setIsMounted(true);
  }, []);

  // Fetch paginated device registry from server (Left-join with all employees)
  const fetchDevices = useCallback(async (page: number, search: string) => {
    setDeviceLoading(true);
    try {
      const url = `/api/device-registry?page=${page}&limit=${PAGE_SIZE}&search=${encodeURIComponent(search)}`;
      const res = await fetch(url, { cache: "no-store" });
      if (res.ok) {
        const json = await res.json();
        setDeviceItems(json.data || []);
        setDeviceTotal(json.pagination?.total || 0);
        setDeviceTotalPages(json.pagination?.totalPages || 1);
        setDevicePage(json.pagination?.page || page);
        setJumpDevicePage(String(json.pagination?.page || page));
        if (json.stats) {
          setDeviceStats(json.stats);
        }
      }
    } catch (e) {
      console.warn("Failed to fetch device registry:", e);
    } finally {
      setDeviceLoading(false);
    }
  }, []);

  // Debounced search for Devices
  useEffect(() => {
    const timer = setTimeout(() => {
      fetchDevices(1, deviceSearchTerm);
    }, 300);
    return () => clearTimeout(timer);
  }, [deviceSearchTerm, fetchDevices]);

  // Real-time Event Listener to automatically refresh on device registration
  useEffect(() => {
    const handleRealtime = (e: any) => {
      const detail = e?.detail;
      if (detail?.type === "device_registered" || detail?.type === "data_mutation") {
        fetchDevices(devicePage, deviceSearchTerm);
      }
    };

    window.addEventListener("sikka:realtime-event", handleRealtime);
    return () => {
      window.removeEventListener("sikka:realtime-event", handleRealtime);
    };
  }, [devicePage, deviceSearchTerm, fetchDevices]);

  // Jump page handler
  const handleJumpDevicePage = (e: React.FormEvent) => {
    e.preventDefault();
    const p = parseInt(jumpDevicePage, 10);
    if (!isNaN(p) && p >= 1 && p <= deviceTotalPages) {
      fetchDevices(p, deviceSearchTerm);
    } else {
      setJumpDevicePage(String(devicePage));
    }
  };

  // Read actual history for device dialog
  const getActualHistory = (emp: any) => {
    if (!emp) return [];
    if (emp.deviceHistory && Array.isArray(emp.deviceHistory)) {
      return [...emp.deviceHistory].reverse();
    }
    return [
      {
        id: "curr",
        from: emp.lastActiveAt || emp.lastTokenUpdated || new Date().toISOString(),
        to: "Present",
        deviceName: emp.deviceName || "Web Node",
        deviceId: emp.deviceId || emp.token || "Active Node",
      }
    ];
  };

  if (!isMounted) return null;

  return (
    <div className="space-y-6 pb-12">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-black text-slate-900 tracking-tight flex items-center gap-3">
             <SmartphoneNfc className="w-8 h-8 text-primary" /> Device Registry & Activity
          </h1>
          <p className="text-muted-foreground text-sm font-medium mt-1 uppercase tracking-widest">
            Employee Security & Authorized Hardware Nodes
          </p>
        </div>
      </div>

      {/* Device Registry Content */}
      <Card className="border-slate-200 shadow-xl overflow-hidden rounded-2xl bg-white">
        <CardHeader className="bg-slate-50 border-b p-4 sm:p-5 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div className="relative max-w-md w-full">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input 
              placeholder="Search by name, ID, hardware, or endpoint..." 
              className="pl-10 h-10 bg-white border-slate-200 rounded-xl" 
              value={deviceSearchTerm}
              onChange={(e) => setDeviceSearchTerm(e.target.value)}
            />
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => fetchDevices(devicePage, deviceSearchTerm)}
              disabled={deviceLoading}
              className="h-10 px-3.5 rounded-xl border-slate-200 text-slate-700 hover:bg-slate-100 gap-1.5 text-xs font-bold"
            >
              <RefreshCw className={cn("w-3.5 h-3.5", deviceLoading && "animate-spin")} /> Refresh
            </Button>
            <Badge variant="outline" className="font-mono text-xs font-bold bg-white border-slate-300 text-slate-800 px-3 py-1.5 shadow-sm">
              {deviceStats.totalEmployees || employees.length || deviceTotal} Employees
            </Badge>
            <Badge className="font-mono text-xs font-bold bg-emerald-50 border border-emerald-200 text-emerald-700 hover:bg-emerald-100 px-3 py-1.5 shadow-sm">
              {deviceStats.registeredCount} Registered
            </Badge>
            <Badge className="font-mono text-xs font-bold bg-rose-50 border border-rose-200 text-rose-700 hover:bg-rose-100 px-3 py-1.5 shadow-sm">
              {deviceStats.notRegisteredCount} Not Registered
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <ScrollArea className="w-full">
            <Table className="min-w-[1300px]">
              <TableHeader className="bg-slate-50/50">
                <TableRow>
                  <TableHead className="font-black uppercase text-[10px] tracking-widest text-slate-500 py-5 px-6 w-[200px]">Employee Name / ID</TableHead>
                  <TableHead className="font-black uppercase text-[10px] tracking-widest text-slate-500 w-[180px]">Role / Dept / Desig</TableHead>
                  <TableHead className="font-black uppercase text-[10px] tracking-widest text-slate-500 w-[170px]">Device & Platform</TableHead>
                  <TableHead className="font-black uppercase text-[10px] tracking-widest text-primary w-[160px]">Current Device ID</TableHead>
                  <TableHead className="font-black uppercase text-[10px] tracking-widest text-slate-500 w-[150px]">Background Status</TableHead>
                  <TableHead className="font-black uppercase text-[10px] tracking-widest text-slate-500 w-[150px]">Last Active</TableHead>
                  <TableHead className="font-black uppercase text-[10px] tracking-widest text-slate-500 w-[130px]">Device Status</TableHead>
                  <TableHead className="text-right font-black uppercase text-[10px] tracking-widest text-slate-500 pr-6 w-[100px]">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {deviceLoading ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-16 text-slate-400">
                      <RefreshCw className="w-6 h-6 animate-spin mx-auto text-primary mb-2" />
                      <p className="text-xs font-bold uppercase tracking-wider">Loading employee device records from MongoDB...</p>
                    </TableCell>
                  </TableRow>
                ) : deviceItems.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-20 text-muted-foreground font-bold">
                      {deviceSearchTerm ? `No matching employee or device records found for "${deviceSearchTerm}".` : "No employees found in the database."}
                    </TableCell>
                  </TableRow>
                ) : (
                  deviceItems.map((dev: any) => {
                    const isRegistered = Boolean(dev.isRegistered);

                    return (
                      <TableRow key={dev.id || dev._id || dev.employeeId} className="hover:bg-slate-50/50 transition-colors">
                        {/* 1. Employee Name / ID */}
                        <TableCell className="px-6 py-4">
                          <div className="flex flex-col">
                            <span className="font-bold text-slate-900 uppercase text-sm">
                              {dev.employeeName || "Employee"}
                            </span>
                            <span className="text-[10px] font-mono text-primary font-black uppercase tracking-tight">
                              {dev.employeeId}
                            </span>
                          </div>
                        </TableCell>

                        {/* 2. Role / Department / Designation */}
                        <TableCell>
                          <div className="flex flex-col">
                            <div className="flex items-center gap-1.5">
                              <Badge className="bg-slate-100 text-slate-800 border-none font-bold text-[9px] uppercase px-1.5 py-0.5">
                                {dev.role || "EMPLOYEE"}
                              </Badge>
                              <span className="text-xs font-bold text-slate-700 truncate max-w-[110px]">{dev.department || "General"}</span>
                            </div>
                            <span className="text-[10px] text-muted-foreground uppercase font-medium mt-0.5 truncate max-w-[150px]">
                              {dev.designation || "Staff"}
                            </span>
                          </div>
                        </TableCell>

                        {/* 3. Device Name & Platform */}
                        <TableCell>
                          {isRegistered ? (
                            <div className="flex items-center gap-2">
                              <MonitorSmartphone className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                              <div className="flex flex-col min-w-0">
                                <span className="text-xs font-bold text-slate-700 uppercase truncate">
                                  {dev.deviceName || "Authorized Device"}
                                </span>
                                <span className="text-[9px] text-slate-400 uppercase font-mono">
                                  {dev.platform || "Android"}
                                </span>
                              </div>
                            </div>
                          ) : (
                            <span className="text-slate-400 text-xs font-mono">—</span>
                          )}
                        </TableCell>

                        {/* 4. Current Device ID */}
                        <TableCell>
                          {isRegistered ? (
                            <Badge variant="outline" className="font-mono text-[10px] font-black uppercase bg-white border-primary/20 text-primary px-2.5 py-0.5 shadow-sm max-w-[140px] truncate" title={dev.deviceId}>
                              {dev.deviceId}
                            </Badge>
                          ) : (
                            <span className="text-slate-400 text-xs font-mono">—</span>
                          )}
                        </TableCell>

                        {/* 5. Background / Telemetry Status */}
                        <TableCell>
                          {isRegistered ? (
                            <Badge className={cn(
                              "text-[10px] font-bold uppercase px-2 py-0.5 shadow-none border",
                              dev.backgroundStatus === 'Active' 
                                ? "bg-emerald-50 text-emerald-700 border-emerald-200" 
                                : dev.backgroundStatus === 'Idle' 
                                  ? "bg-amber-50 text-amber-700 border-amber-200" 
                                  : "bg-slate-100 text-slate-600 border-slate-200"
                            )}>
                              {dev.backgroundStatus || "Idle"}
                            </Badge>
                          ) : (
                            <span className="text-slate-400 text-xs font-mono">—</span>
                          )}
                        </TableCell>

                        {/* 6. Last Active */}
                        <TableCell>
                          {isRegistered && dev.lastActiveDisplay ? (
                            <span className="text-xs font-semibold text-slate-600">
                              {dev.lastActiveDisplay}
                            </span>
                          ) : (
                            <span className="text-slate-400 text-xs font-mono">—</span>
                          )}
                        </TableCell>

                        {/* 7. Registration Status */}
                        <TableCell>
                          {isRegistered ? (
                            <Badge className="bg-emerald-500 text-white font-bold text-[10px] uppercase px-2.5 py-0.5 shadow-sm">
                              Registered
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="bg-slate-100 text-slate-500 border-slate-200 font-bold text-[10px] uppercase px-2.5 py-0.5">
                              Not Registered
                            </Badge>
                          )}
                        </TableCell>

                        {/* 8. Action */}
                        <TableCell className="text-right pr-6">
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            className="h-8 px-2.5 rounded-xl font-bold text-xs hover:bg-slate-100 gap-1 text-slate-700"
                            onClick={() => setSelectedEmployee(dev)}
                          >
                            <History className="w-3.5 h-3.5 text-slate-400" /> Details
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </ScrollArea>
        </CardContent>

        {/* Server-Side Pagination Footer */}
        <CardFooter className="bg-slate-50/80 border-t p-4 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="text-xs text-slate-500 font-medium">
            Showing Page <span className="font-bold text-slate-900">{devicePage}</span> of{" "}
            <span className="font-bold text-slate-900">{deviceTotalPages}</span> ({deviceTotal} Total Employees)
          </div>

          <div className="flex items-center gap-2">
            {/* Previous Button */}
            <Button
              variant="outline"
              size="sm"
              onClick={() => fetchDevices(devicePage - 1, deviceSearchTerm)}
              disabled={devicePage <= 1 || deviceLoading}
              className="h-9 px-3 rounded-xl font-bold text-xs border-slate-200 gap-1.5"
            >
              <ChevronLeft className="w-4 h-4" /> Prev
            </Button>

            {/* Jump to Page Form */}
            <form onSubmit={handleJumpDevicePage} className="flex items-center gap-1.5">
              <span className="text-xs text-slate-400 font-medium">Page</span>
              <Input
                value={jumpDevicePage}
                onChange={(e) => setJumpDevicePage(e.target.value)}
                className="w-12 h-9 text-xs text-center font-bold bg-white border-slate-200 rounded-xl px-1"
                min={1}
                max={deviceTotalPages}
              />
              <span className="text-xs text-slate-400 font-medium">of {deviceTotalPages}</span>
              <Button
                type="submit"
                variant="ghost"
                size="sm"
                className="h-9 px-2 text-xs font-bold text-primary hover:bg-primary/5 rounded-xl"
              >
                Go
              </Button>
            </form>

            {/* Next Button */}
            <Button
              variant="outline"
              size="sm"
              onClick={() => fetchDevices(devicePage + 1, deviceSearchTerm)}
              disabled={devicePage >= deviceTotalPages || deviceLoading}
              className="h-9 px-3 rounded-xl font-bold text-xs border-slate-200 gap-1.5"
            >
              Next <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </CardFooter>
      </Card>

      {/* ========================================================= */}
      {/* EMPLOYEE DEVICE DETAILS & HARDWARE HISTORY MODAL          */}
      {/* ========================================================= */}
      <Dialog open={!!selectedEmployee} onOpenChange={() => setSelectedEmployee(null)}>
        <DialogContent className="max-w-2xl p-0 overflow-hidden border-none shadow-2xl rounded-3xl bg-white">
          {selectedEmployee && (
            <div>
              <DialogHeader className="bg-slate-900 text-white p-6 relative overflow-hidden">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-2xl bg-primary/20 flex items-center justify-center border border-primary/30 text-primary">
                    <UserIcon className="w-6 h-6" />
                  </div>
                  <div>
                    <DialogTitle className="text-xl font-black uppercase tracking-tight">
                      {selectedEmployee.employeeName || selectedEmployee.name || "Employee"}
                    </DialogTitle>
                    <p className="text-xs text-slate-400 font-mono font-bold mt-0.5">
                      ID: {selectedEmployee.employeeId} • {selectedEmployee.department || "General"} Staff
                    </p>
                  </div>
                </div>
              </DialogHeader>

              <div className="p-6 space-y-6 max-h-[75vh] overflow-y-auto">
                {/* Active Device Info */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
                    <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 block mb-1">
                      Active Device
                    </span>
                    <span className="text-sm font-bold text-slate-900 block truncate">
                      {selectedEmployee.deviceName || "No active device"}
                    </span>
                    <span className="text-xs text-slate-500 font-mono mt-0.5 block">
                      Platform: {selectedEmployee.platform || "Web / Mobile"}
                    </span>
                  </div>

                  <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
                    <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 block mb-1">
                      Registration Status
                    </span>
                    <div className="mt-1 flex items-center gap-2">
                      {selectedEmployee.isRegistered ? (
                        <Badge className="bg-emerald-600 text-white font-bold text-xs uppercase px-2.5 py-0.5">
                          Registered
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="bg-slate-100 text-slate-500 font-bold text-xs uppercase px-2.5 py-0.5">
                          Not Registered
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>

                {/* Device Hardware History Log */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-black uppercase tracking-widest text-slate-400 flex items-center gap-1.5">
                      <History className="w-3.5 h-3.5 text-primary" /> Hardware Registration History
                    </h4>
                    <span className="text-[10px] font-bold text-slate-400">
                      {getActualHistory(selectedEmployee).length} Total Node(s)
                    </span>
                  </div>

                  <div className="border border-slate-100 rounded-2xl overflow-hidden divide-y divide-slate-100">
                    {getActualHistory(selectedEmployee).map((hist: any, idx: number) => (
                      <div key={hist.id || idx} className="p-4 bg-white flex items-center justify-between gap-4">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-xl bg-slate-100 flex items-center justify-center text-slate-600 shrink-0">
                            <MonitorSmartphone className="w-4 h-4" />
                          </div>
                          <div>
                            <span className="text-xs font-bold text-slate-900 block">
                              {hist.deviceName || "Web / Android Client"}
                            </span>
                            <span className="text-[10px] font-mono text-slate-400">
                              Device ID: {hist.deviceId ? `${hist.deviceId.substring(0, 16)}...` : "Active Node"}
                            </span>
                          </div>
                        </div>

                        <div className="text-right">
                          <Badge variant="outline" className="text-[9px] font-mono font-bold bg-slate-50 text-slate-600 border-slate-200">
                            {hist.to === "Present" ? "Current Active" : "Previous"}
                          </Badge>
                          <span className="text-[10px] text-slate-400 block mt-0.5">
                            {hist.to || "Active"}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <DialogFooter className="p-4 bg-slate-50 border-t border-slate-100">
                <Button 
                  onClick={() => setSelectedEmployee(null)}
                  className="w-full bg-slate-900 text-white hover:bg-slate-800 rounded-xl font-bold text-xs h-10"
                >
                  Close Details
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
