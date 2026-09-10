"use client";

import { useEffect, useState, useMemo, useRef } from "react";
import { useRouter, usePathname } from "next/navigation";
import Image from "next/image";
import { 
  SidebarProvider, 
  Sidebar, 
  SidebarContent, 
  SidebarHeader, 
  SidebarMenu, 
  SidebarMenuItem, 
  SidebarMenuButton, 
  SidebarTrigger,
  SidebarInset,
  SidebarFooter
} from "@/components/ui/sidebar";
import { 
  LayoutDashboard, 
  UserCheck, 
  Users as UsersIcon, 
  Calendar, 
  FileText, 
  Settings, 
  LogOut, 
  Factory, 
  BarChart3, 
  Clock, 
  User as UserIcon, 
  Camera, 
  ShieldAlert, 
  ArrowLeft, 
  Smartphone,
  Globe
} from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { DataProvider, useData } from "@/context/data-context";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { 
  TooltipProvider,
} from "@/components/ui/tooltip";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import Cookies from 'js-cookie';
import { format } from "date-fns";
import { registerNativeUser, logoutNativeUser } from "@/lib/android-bridge";
import { APP_MODULES, checkUserModuleAccess } from "@/lib/modules";

function HeaderActions() {
  const { verifiedUser } = useData();
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const router = useRouter();

  const handleLogout = () => {
    logoutNativeUser();
    Cookies.remove('sikka_session', { path: '/' });
    localStorage.removeItem("user");
    router.push("/login");
  };

  const handleSaveProfile = (updatedUser: any) => {
    const sessionData = JSON.stringify(updatedUser);
    Cookies.set('sikka_session', sessionData, { expires: 365, path: '/' });
    localStorage.setItem("user", sessionData);
  };

  if (!verifiedUser) return null;

  return (
    <div className="flex items-center gap-3 sm:gap-5">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <div className="flex items-center gap-3 pl-2 cursor-pointer group hover:bg-slate-50 p-1 rounded-xl transition-colors">
            <div className="text-right hidden sm:block">
              <p className="text-sm font-bold text-slate-900 leading-none">{verifiedUser.fullName}</p>
              <p className="text-[10px] font-black text-primary mt-1.5 uppercase tracking-wider leading-none">{verifiedUser.role?.replace(/_/g, " ")}</p>
            </div>
            <Avatar className="h-10 w-10 border border-slate-200 shadow-sm transition-transform group-hover:scale-105">
              <AvatarImage src={verifiedUser.avatar || `https://picsum.photos/seed/${verifiedUser.username}/40/40`} />
              <AvatarFallback className="bg-slate-100 text-slate-400 font-bold">{verifiedUser.fullName?.[0]}</AvatarFallback>
            </Avatar>
          </div>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56 mt-2 rounded-xl shadow-xl">
          <DropdownMenuLabel className="font-bold text-xs uppercase tracking-widest text-slate-400">My Account</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem className="gap-2 cursor-pointer py-2.5 font-semibold" onSelect={(e) => { e.preventDefault(); setIsSettingsOpen(true); }}>
            <Settings className="w-4 h-4 text-slate-500" /> Settings
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem className="gap-2 cursor-pointer py-2.5 font-semibold text-rose-600 focus:text-rose-600 focus:bg-rose-50" onClick={handleLogout}>
            <LogOut className="w-4 h-4" /> Logout
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <ProfileSettingsDialog 
        isOpen={isSettingsOpen} 
        onOpenChange={setIsSettingsOpen} 
        user={verifiedUser} 
        onSave={handleSaveProfile}
      />
    </div>
  );
}

function ProfileSettingsDialog({ isOpen, onOpenChange, user, onSave }: { isOpen: boolean, onOpenChange: (o: boolean) => void, user: any, onSave: (u: any) => void }) {
  const { updateRecord, employees } = useData();
  const [name, setName] = useState(user.fullName);
  const [avatar, setAvatar] = useState(user.avatar || "");
  const [language, setLanguage] = useState(user.language || "en");
  const [isProcessing, setIsProcessing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  useEffect(() => {
    setName(user.fullName);
    setAvatar(user.avatar || "");
    setLanguage(user.language || "en");
  }, [user]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 200 * 1024) {
        toast({ variant: "destructive", title: "File too large", description: "Profile photo must be under 200 KB." });
        if (fileInputRef.current) fileInputRef.current.value = "";
        return;
      }
      const reader = new FileReader();
      reader.onloadend = () => {
        setAvatar(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSave = async () => {
    if (!name.trim()) {
      toast({ variant: "destructive", title: "Name required", description: "Please enter your full name." });
      return;
    }

    setIsProcessing(true);
    try {
      if (user.role !== 'SUPER_ADMIN' && user.role !== 'EMPLOYEE' && user.id) {
        updateRecord('users', user.id, { fullName: name, avatar: avatar, language: language });
      }

      if (user.role === 'EMPLOYEE') {
        const loginIdent = String(user.username || user.employeeId || user.id || '').replace(/\s/g, '').toUpperCase();
        const dbEmp = employees.find(e => {
          const empId = String(e.employeeId || e.id || '').replace(/\s/g, '').toUpperCase();
          const empAadhaar = String((e as any).aadhaarNumber || e.aadhaar || '').replace(/\s/g, '');
          const empMobile = String((e as any).mobileNumber || e.mobile || '').replace(/\s/g, '');
          return empId === loginIdent || empAadhaar === loginIdent || empMobile === loginIdent;
        });
        if (dbEmp) {
          updateRecord('employees', dbEmp.id, { avatar: avatar, language: language });
        }
      }

      const updatedUser = { ...user, fullName: name, avatar, language };
      
      // Persist in localStorage and session cookie
      if (typeof window !== 'undefined') {
        try {
          localStorage.setItem('user', JSON.stringify(updatedUser));
          Cookies.set('sikka_session', JSON.stringify(updatedUser), { expires: 365, path: '/' });
        } catch {}
      }

      onSave(updatedUser);
      onOpenChange(false);
      toast({
        title: language === 'hi' ? "प्रोफ़ाइल अपडेट हो गई" : "Profile Updated",
        description: language === 'hi' ? "आपकी सेटिंग्स सफलतापूर्वक सहेजी गई हैं।" : "Your settings have been saved successfully."
      });
    } catch (e) {
      toast({ variant: "destructive", title: "Error", description: "Failed to update profile record." });
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md rounded-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserIcon className="w-5 h-5 text-primary" /> Profile Settings
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-6 py-4">
          <div className="flex flex-col items-center gap-4">
            <div className="relative group">
              <Avatar className="h-24 w-24 border-4 border-white shadow-xl">
                <AvatarImage src={avatar || `https://picsum.photos/seed/${user.username}/96/96`} />
                <AvatarFallback className="text-2xl font-black bg-slate-100">{name?.[0]}</AvatarFallback>
              </Avatar>
              <Button 
                size="icon" 
                variant="secondary" 
                className="absolute bottom-0 right-0 h-8 w-8 rounded-full shadow-lg border-2 border-white bg-primary text-white hover:bg-primary/90"
                onClick={() => fileInputRef.current?.click()}
                disabled={isProcessing}
              >
                <Camera className="w-4 h-4" />
              </Button>
              <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handleFileChange} />
            </div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Max Size: 200 KB</p>
          </div>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label className="font-bold text-xs uppercase text-slate-500 tracking-wider">Full Name</Label>
              <Input 
                value={name} 
                onChange={(e) => setName(e.target.value)} 
                className="h-12 bg-slate-50 border-slate-200 rounded-xl font-bold"
                placeholder="Enter your name"
                disabled={user.role === 'EMPLOYEE' || isProcessing}
              />
              {user.role === 'EMPLOYEE' && (
                <p className="text-[9px] font-bold text-slate-400 uppercase">Verified via Employee Directory</p>
              )}
            </div>

            {/* Language Selection Option (Section 13 & 14) */}
            <div className="space-y-2">
              <Label className="font-bold text-xs uppercase text-slate-500 tracking-wider flex items-center gap-1.5">
                <Globe className="w-3.5 h-3.5 text-primary" /> Language / भाषा
              </Label>
              <Select value={language} onValueChange={(val) => setLanguage(val)}>
                <SelectTrigger className="h-12 bg-slate-50 border-slate-200 rounded-xl font-bold text-sm">
                  <SelectValue placeholder="Select Language" />
                </SelectTrigger>
                <SelectContent className="rounded-xl border-slate-200 shadow-xl">
                  <SelectItem value="en" className="font-bold text-xs py-2.5">
                    English (Default)
                  </SelectItem>
                  <SelectItem value="hi" className="font-bold text-xs py-2.5">
                    Hindi (हिन्दी)
                  </SelectItem>
                </SelectContent>
              </Select>
              <p className="text-[9px] font-semibold text-slate-400">
                Attendance interface and reminders will use this language.
              </p>
            </div>

            <div className="space-y-2">
              <Label className="font-bold text-xs uppercase text-slate-500 tracking-wider">Username (Read-only)</Label>
              <Input value={user.username} disabled className="h-12 bg-slate-100 border-slate-200 rounded-xl font-mono text-xs italic" />
            </div>
          </div>
        </div>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="ghost" onClick={() => onOpenChange(false)} className="rounded-xl font-bold">Cancel</Button>
          <Button className="bg-primary rounded-xl font-bold px-8 shadow-lg shadow-primary/20" onClick={handleSave} disabled={isProcessing}>
            {isProcessing ? "Saving..." : "Save Changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SidebarNav() {
  const pathname = usePathname();
  const router = useRouter();
  const { verifiedUser } = useData();

  if (!verifiedUser) return null;

  const userRole = String(verifiedUser.role || '').toUpperCase();
  const isEmployeeRole = userRole === 'EMPLOYEE' ||
    (Array.isArray(verifiedUser.role) && verifiedUser.role.map((r: any) => String(r).toUpperCase()).includes('EMPLOYEE')) ||
    (!!verifiedUser.employeeId && !['SUPER_ADMIN', 'ADMIN', 'HR', 'SECURITY', 'USER'].includes(userRole));

  const filteredMenu = APP_MODULES.filter(item => {
    if (userRole === 'SUPER_ADMIN') return true;

    if (isEmployeeRole) {
      return item.path === '/dashboard/attendance' || item.path === '/dashboard/holidays';
    }

    return checkUserModuleAccess(verifiedUser, item.id);
  });

  return (
    <>
      <SidebarHeader className="p-4">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center shadow-lg shadow-primary/30">
            <span className="text-white font-bold text-lg">S</span>
          </div>
          <span className="font-black text-lg tracking-tighter group-data-[collapsible=icon]:hidden">Sikka HRMS</span>
        </div>
      </SidebarHeader>
      <SidebarContent className="px-2">
        <SidebarMenu>
          {filteredMenu.map((item) => (
            <SidebarMenuItem key={item.path}>
              <SidebarMenuButton 
                isActive={pathname === item.path}
                onClick={() => router.push(item.path)}
                tooltip={item.name}
                className="h-11 px-3"
              >
                <item.icon className="w-5 h-5 mr-3" />
                <span className="font-bold group-data-[collapsible=icon]:hidden">{item.name}</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarContent>
      <SidebarFooter className="p-4">
        <Button variant="ghost" className="w-full justify-start text-rose-600 font-bold hover:bg-rose-50 hover:text-rose-700 group-data-[collapsible=icon]:p-2" onClick={() => {
          logoutNativeUser();
          Cookies.remove('sikka_session', { path: '/' });
          localStorage.removeItem("user");
          router.push("/login");
        }}>
          <LogOut className="w-5 h-5 mr-3 group-data-[collapsible=icon]:mr-0" />
          <span className="font-bold group-data-[collapsible=icon]:hidden">Logout</span>
        </Button>
      </SidebarFooter>
    </>
  );
}

function AuthorizedContent({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { verifiedUser, isLoading, employees, users, refreshData } = useData();
  const [isAuthorized, setIsAuthorized] = useState<boolean | null>(null);
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  const logoUrl = "https://sikkaenterprises.com/assets/images/Capture13.51191245_std.JPG";



  // Register active user credentials with Android Native Bridge
  useEffect(() => {
    if (verifiedUser) {
      const empId = verifiedUser.employeeId || verifiedUser.username || verifiedUser.id || '';
      registerNativeUser(empId, verifiedUser.role || 'EMPLOYEE', verifiedUser.fullName || (verifiedUser as any).name || '');
    }
  }, [verifiedUser]);

  // Continuous background GPS telemetry heartbeat for active employee devices
  useEffect(() => {
    if (!verifiedUser || typeof window === 'undefined' || !navigator.geolocation) return;

    const empId = verifiedUser.employeeId || verifiedUser.username || verifiedUser.id || '';
    if (!empId) return;

    const sendGpsPing = () => {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const { latitude: gpsLatitude, longitude: gpsLongitude } = pos.coords;
          const deviceId = localStorage.getItem('sikka_device_id') || '';

          fetch('/api/device-registry/heartbeat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              employeeId: empId,
              deviceId,
              gpsLatitude,
              gpsLongitude,
            }),
          }).catch(() => {});
        },
        () => {},
        { enableHighAccuracy: true, timeout: 5000, maximumAge: 30000 }
      );
    };

    sendGpsPing();
    const interval = setInterval(sendGpsPing, 30000); // Heartbeat ping every 30s

    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const { latitude: gpsLatitude, longitude: gpsLongitude } = pos.coords;
        const deviceId = localStorage.getItem('sikka_device_id') || '';

        fetch('/api/device-registry/heartbeat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            employeeId: empId,
            deviceId,
            gpsLatitude,
            gpsLongitude,
          }),
        }).catch(() => {});
      },
      () => {},
      { enableHighAccuracy: true, timeout: 5000, maximumAge: 30000 }
    );

    return () => {
      clearInterval(interval);
      if (watchId !== null) navigator.geolocation.clearWatch(watchId);
    };
  }, [verifiedUser]);

  // Quick authorization check without blocking users
  useEffect(() => {
    if (!verifiedUser) return;

    const userRole = String(verifiedUser.role || '').toUpperCase();
    const isEmployeeRole = userRole === 'EMPLOYEE' ||
      (Array.isArray(verifiedUser.role) && verifiedUser.role.map((r: any) => String(r).toUpperCase()).includes('EMPLOYEE')) ||
      (!!verifiedUser.employeeId && !['SUPER_ADMIN', 'ADMIN', 'HR', 'SECURITY', 'USER'].includes(userRole));

    // Mark Attendance & Holidays are accessible by Employee role
    if (isEmployeeRole) {
      if (pathname === '/dashboard/attendance' || pathname === '/dashboard/holidays') {
        setIsAuthorized(true);
        return;
      }
      // Employees navigating anywhere other than /dashboard/attendance get seamlessly redirected to Mark Attendance
      router.replace("/dashboard/attendance");
      return;
    }

    const isSuperAdmin = userRole === 'SUPER_ADMIN';
    if (isSuperAdmin) {
      setIsAuthorized(true);
      return;
    }

    const hasPerm = checkUserModuleAccess(verifiedUser, pathname);
    setIsAuthorized(hasPerm);
  }, [verifiedUser, pathname, router]);

  const userRoleUpper = String(verifiedUser?.role || '').toUpperCase();
  const isEmployee = userRoleUpper === 'EMPLOYEE' ||
    (Array.isArray(verifiedUser?.role) && verifiedUser.role.map((r: any) => String(r).toUpperCase()).includes('EMPLOYEE')) ||
    (!!verifiedUser?.employeeId && !['SUPER_ADMIN', 'ADMIN', 'HR', 'SECURITY', 'USER'].includes(userRoleUpper));

  // Only show minimal loader if user session has not loaded yet
  if (!isMounted || (!verifiedUser && isLoading)) {
    return (
      <div className="h-screen w-full flex items-center justify-center bg-slate-50" suppressHydrationWarning>
        <div className="flex flex-col items-center gap-5">
          <div className="relative flex items-center justify-center w-28 h-28">
            <div className="absolute inset-0 rounded-full border-2 border-dashed border-[#C59D2E]/40 animate-gateway-spin-slow" />
            <div className="absolute inset-2 rounded-full border border-blue-500/20 animate-gateway-spin-reverse" />
            <div className="relative w-20 h-20 rounded-2xl bg-white shadow-xl overflow-hidden p-1 border-2 border-[#C59D2E] animate-gateway-pulse-glow flex items-center justify-center">
              <Image
                src={logoUrl}
                alt="Sikka Logo"
                width={72}
                height={72}
                className="w-full h-full object-cover rounded-xl"
                priority
              />
            </div>
          </div>

          <div className="text-center space-y-1">
            <p className="text-xs font-black text-slate-700 uppercase tracking-widest flex items-center justify-center gap-2">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500"></span>
              </span>
              Loading Portal...
            </p>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
              Sikka Enterprises & Logistics
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Access Denied page is strictly for Admin/HR users attempting to access unauthorized administrative modules
  // Employees are NEVER shown the Access Denied screen
  if (isAuthorized === false && !isEmployee) {
    return (
      <div className="h-screen w-full flex flex-col items-center justify-center bg-slate-50 p-6">
        <div className="w-20 h-20 bg-rose-50 rounded-3xl flex items-center justify-center mb-6 shadow-xl border border-rose-100">
          <ShieldAlert className="w-10 h-10 text-rose-500" />
        </div>
        <h1 className="text-3xl font-black text-slate-900 mb-2 tracking-tight">Access Denied</h1>
        <p className="text-slate-500 font-medium text-center max-w-sm mb-8">
          You do not have the required permissions to view this administrative module.
        </p>
        <Button 
          className="bg-primary px-8 h-12 rounded-xl font-bold shadow-lg shadow-primary/20 gap-2"
          onClick={() => {
            const firstAllowed = APP_MODULES.find(m => checkUserModuleAccess(verifiedUser, m.id));
            router.push(firstAllowed?.path || (userRoleUpper === 'EMPLOYEE' ? "/dashboard/attendance" : "/dashboard"));
          }}
        >
          <ArrowLeft className="w-4 h-4" /> Go to Authorized Module
        </Button>
      </div>
    );
  }

  if (isEmployee) {
    return (
      <div className="min-h-screen w-full bg-slate-50 sm:bg-slate-100 flex justify-center">
        {/* Mobile View Container: Full width on mobile, nicely framed on tablets/desktop */}
        <div className="w-full sm:max-w-md md:max-w-lg min-h-screen bg-white sm:shadow-2xl flex flex-col sm:border-x border-slate-200/80">
          {/* Mobile App Header */}
          <header className="h-16 border-b border-slate-200/80 flex items-center justify-between px-3 sm:px-5 bg-white shrink-0 sticky top-0 z-30 shadow-sm">
            <div className="flex items-center gap-2.5 sm:gap-3">
              <div className="w-9 h-9 bg-primary rounded-xl flex items-center justify-center shadow-md shadow-primary/20">
                <span className="text-white font-black text-lg">S</span>
              </div>
              <div>
                <h2 className="text-sm font-black text-slate-900 uppercase tracking-wider leading-none">
                  Sikka HRMS
                </h2>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">
                  Employee Portal
                </p>
              </div>
            </div>
            
            <HeaderActions />
          </header>

          <main 
            className="flex-1 p-2 sm:p-4 overflow-y-auto bg-slate-50/50 outline-none"
            tabIndex={0}
            role="main"
          >
            <div className="w-full mx-auto">
              {children}
            </div>
          </main>
          
          <footer className="py-4 border-t border-slate-100 flex items-center justify-center px-4 bg-white text-[10px] font-black uppercase tracking-widest text-slate-400 shrink-0 text-center">
            © Sikka Industries & Logistics – Version 1.0
          </footer>
        </div>
      </div>
    );
  }

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full bg-background overflow-hidden">
        <Sidebar collapsible="icon" className="border-r border-slate-200">
          <SidebarNav />
        </Sidebar>

        <SidebarInset className="flex flex-col flex-1 h-screen overflow-hidden">
          <header className="h-16 border-b border-slate-200 flex items-center justify-between px-6 bg-white shrink-0 z-20">
            <div className="flex items-center gap-4">
              <SidebarTrigger />
              <Separator orientation="vertical" className="h-6" />
              <h2 className="text-xs font-black text-slate-400 uppercase tracking-[0.2em]">
                {pathname.split("/").pop()?.replace(/-/g, " ") || "Overview"}
              </h2>
            </div>
            
            <HeaderActions />
          </header>

          <main 
            className="flex-1 p-6 overflow-y-auto bg-slate-50/50 outline-none focus-visible:ring-1 focus-visible:ring-primary/10"
            tabIndex={0}
            role="main"
          >
            <div className="max-w-7xl mx-auto">
              {children}
            </div>
          </main>
          
          <footer className="h-12 border-t border-slate-100 flex items-center justify-center px-6 bg-white text-[10px] font-black uppercase tracking-widest text-slate-400 shrink-0">
            © Sikka Industries & Logistics – Version 1.0
          </footer>
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <TooltipProvider>
      <DataProvider>
        <AuthorizedContent>
          {children}
        </AuthorizedContent>
      </DataProvider>
    </TooltipProvider>
  );
}