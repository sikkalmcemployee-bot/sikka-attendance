"use client";

import { useState, useMemo, useEffect } from "react";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { 
  UserPlus, 
  Search, 
  ShieldCheck, 
  Key,
  Pencil,
  Trash2,
  AlertTriangle,
  Eye,
  EyeOff,
  Check,
  SearchIcon,
  Globe,
  Users,
  Factory,
  UserCheck,
  CheckSquare,
  Square,
  Sparkles,
  Shield,
  Layers
} from "lucide-react";
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogFooter,
  DialogDescription
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { useData } from "@/context/data-context";
import { useToast } from "@/hooks/use-toast";
import { User, Role } from "@/lib/types";
import { APP_MODULES, AppModule } from "@/lib/modules";
import { cn } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";

const INITIAL_USER_STATE: Partial<User> = {
  fullName: "",
  username: "",
  password: "",
  role: "SECURITY",
  permissions: ["dashboard"],
  plantIds: [],
  status: "Active"
};

export default function UserManagementPage() {
  const { users, plants, addRecord, updateRecord } = useData();
  const { toast } = useToast();
  const [searchTerm, setSearchTerm] = useState("");
  const [moduleSearch, setModuleSearch] = useState("");
  const [plantSearch, setPlantSearch] = useState("");
  const [isMounted, setIsMounted] = useState(false);

  // Modal States
  const [isUserModalOpen, setIsUserModalOpen] = useState(false);
  const [isStatusAlertOpen, setIsStatusAlertOpen] = useState(false);
  const [isResetPasswordOpen, setIsResetPasswordOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [userToAction, setUserToAction] = useState<User | null>(null);
  const [formData, setFormData] = useState<Partial<User>>(INITIAL_USER_STATE);
  const [showPassword, setShowPassword] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  const filteredUsers = useMemo(() => {
    const sorted = [...(users || [])].reverse();
    return sorted.filter(u => {
      const nameMatch = u.fullName?.toLowerCase().includes(searchTerm.toLowerCase());
      const userMatch = u.username?.toLowerCase().includes(searchTerm.toLowerCase());
      const roleMatch = u.role?.toLowerCase().includes(searchTerm.toLowerCase());
      return nameMatch || userMatch || roleMatch;
    });
  }, [users, searchTerm]);

  // Master Modules filter
  const filteredModules = useMemo(() => {
    const search = moduleSearch.toLowerCase();
    return APP_MODULES.filter(m => {
      return (
        m.name.toLowerCase().includes(search) ||
        m.id.toLowerCase().includes(search) ||
        m.category.toLowerCase().includes(search) ||
        m.description.toLowerCase().includes(search)
      );
    });
  }, [moduleSearch]);

  // Master Plants filter
  const filteredPlants = useMemo(() => {
    return (Array.isArray(plants) ? plants : []).filter(p => 
      p?.name?.toLowerCase().includes(plantSearch.toLowerCase()) ||
      p?.code?.toLowerCase().includes(plantSearch.toLowerCase())
    );
  }, [plants, plantSearch]);

  // Check if All Plants are selected
  const isAllPlantsSelected = useMemo(() => {
    const allPlantsList = Array.isArray(plants) ? plants : [];
    if (allPlantsList.length === 0) return false;
    const currentPlantIds = formData.plantIds || [];
    if (currentPlantIds.includes("*") || currentPlantIds.includes("all") || currentPlantIds.includes("All")) {
      return true;
    }
    const allIds = allPlantsList.map(p => p.id || (p as any)._id);
    return allIds.length > 0 && allIds.every(id => currentPlantIds.includes(id));
  }, [plants, formData.plantIds]);

  // Check if All Pages/Modules are selected
  const isAllPagesSelected = useMemo(() => {
    const currentPerms = formData.permissions || [];
    if (currentPerms.includes("*") || currentPerms.includes("all") || currentPerms.includes("All")) {
      return true;
    }
    const allIds = APP_MODULES.map(m => m.id);
    return allIds.every(id => 
      currentPerms.includes(id) || 
      currentPerms.includes(id.toLowerCase()) ||
      currentPerms.some(p => p.toLowerCase() === id.toLowerCase())
    );
  }, [formData.permissions]);

  // Password strength calculation
  const passwordStrength = useMemo(() => {
    const p = formData.password || "";
    if (!p) return { score: 0, label: "NONE", color: "bg-slate-200" };
    
    let score = 0;
    if (p.length >= 8) score++;
    if (/[A-Z]/.test(p)) score++;
    if ((p.match(/[0-9]/g) || []).length >= 3) score++;
    if (/[@#$%&]/.test(p)) score++;

    if (score <= 1) return { score, label: "WEAK", color: "bg-rose-500" };
    if (score <= 3) return { score, label: "MEDIUM", color: "bg-amber-500" };
    return { score, label: "STRONG", color: "bg-emerald-500" };
  }, [formData.password]);

  // Open User Modal (Create or Edit)
  const handleOpenModal = (user?: User) => {
    if (user) {
      setEditingUser(user);
      setFormData({
        fullName: user.fullName || "",
        username: user.username || "",
        role: user.role || "SECURITY",
        permissions: (user as any).permissions || [],
        plantIds: (user as any).plantIds || [],
        status: user.status || "Active"
      });
    } else {
      setEditingUser(null);
      setFormData({
        ...INITIAL_USER_STATE,
        role: "SECURITY",
        permissions: ["dashboard"],
        plantIds: []
      });
    }
    setShowPassword(false);
    setModuleSearch("");
    setPlantSearch("");
    setIsUserModalOpen(true);
  };

  // Toggle All Plants
  const handleToggleAllPlants = () => {
    const allPlantsList = Array.isArray(plants) ? plants : [];
    if (isAllPlantsSelected) {
      setFormData(p => ({ ...p, plantIds: [] }));
    } else {
      const allIds = allPlantsList.map(pl => pl.id || (pl as any)._id);
      setFormData(p => ({ ...p, plantIds: ["*", ...allIds] }));
    }
  };

  // Toggle Single Plant
  const handleTogglePlant = (plantId: string) => {
    const allPlantsList = Array.isArray(plants) ? plants : [];
    const allIds = allPlantsList.map(pl => pl.id || (pl as any)._id);
    const current = formData.plantIds || [];

    if (current.includes("*") || current.includes("all") || current.includes("All")) {
      // De-select this plant from wildcard
      const remaining = allIds.filter(id => id !== plantId);
      setFormData(p => ({ ...p, plantIds: remaining }));
      return;
    }

    let updated: string[];
    if (current.includes(plantId)) {
      updated = current.filter(id => id !== plantId);
    } else {
      updated = [...current, plantId];
      if (allIds.length > 0 && allIds.every(id => updated.includes(id))) {
        updated = ["*", ...allIds];
      }
    }
    setFormData(p => ({ ...p, plantIds: updated }));
  };

  // Toggle All Pages/Modules
  const handleToggleAllPages = () => {
    if (isAllPagesSelected) {
      setFormData(p => ({ ...p, permissions: [] }));
    } else {
      const allModuleIds = APP_MODULES.map(m => m.id);
      setFormData(p => ({ ...p, permissions: ["*", ...allModuleIds] }));
    }
  };

  // Toggle Single Page/Module
  const handleTogglePage = (moduleId: string) => {
    const allModuleIds = APP_MODULES.map(m => m.id);
    const current = formData.permissions || [];

    if (current.includes("*") || current.includes("all") || current.includes("All")) {
      // De-select this module from wildcard
      const remaining = allModuleIds.filter(id => id !== moduleId);
      setFormData(p => ({ ...p, permissions: remaining }));
      return;
    }

    const isMatch = (val: string) => val.toLowerCase() === moduleId.toLowerCase();
    let updated: string[];
    if (current.some(isMatch)) {
      updated = current.filter(id => !isMatch(id));
    } else {
      updated = [...current, moduleId];
      if (allModuleIds.every(id => updated.some(u => u.toLowerCase() === id.toLowerCase()))) {
        updated = ["*", ...allModuleIds];
      }
    }
    setFormData(p => ({ ...p, permissions: updated }));
  };

  // Helper check for plant check state
  const isPlantChecked = (plantId: string) => {
    const current = formData.plantIds || [];
    return current.includes("*") || current.includes("all") || current.includes(plantId);
  };

  // Helper check for page check state
  const isPageChecked = (moduleId: string) => {
    const current = formData.permissions || [];
    return (
      current.includes("*") || 
      current.includes("all") || 
      current.includes("All") ||
      current.includes(moduleId) ||
      current.some(p => p.toLowerCase() === moduleId.toLowerCase())
    );
  };

  const validateUserForm = () => {
    const { fullName, username, password } = formData;

    if (!fullName || !/^[a-zA-Z\s]+$/.test(fullName) || fullName.trim().length < 3) {
      toast({ variant: "destructive", title: "Invalid Name", description: "Alphabets and spaces only (min 3 chars)." });
      return false;
    }

    if (!username || username.length < 4 || /\s/.test(username) || !/^[a-z0-9_-]+$/.test(username)) {
      toast({ variant: "destructive", title: "Invalid Username", description: "Min 4 chars, lowercase and numbers/hyphens only, no spaces." });
      return false;
    }

    const exists = users.find(u => 
      u.username?.toLowerCase() === username.toLowerCase() && 
      (u.id || (u as any)._id) !== (editingUser?.id || (editingUser as any)?._id)
    );
    if (exists) {
      toast({ variant: "destructive", title: "Duplicate Username", description: "This username is already taken." });
      return false;
    }

    if (!editingUser || isResetPasswordOpen) {
      if (!password || password.length < 6) {
        toast({ variant: "destructive", title: "Invalid Password", description: "Password must be at least 6 characters." });
        return false;
      }
    }

    return true;
  };

  const handleSaveUser = async () => {
    if (!validateUserForm()) return;

    setIsProcessing(true);
    let success = false;
    try {
      const baseUserData = {
        fullName: formData.fullName!.trim(),
        username: formData.username!.trim().toLowerCase(),
        role: (formData.role as Role) || "SECURITY",
        permissions: formData.permissions || [],
        plantIds: formData.plantIds || [],
        status: formData.status || "Active",
      };

      if (editingUser) {
        const finalId = editingUser.id || (editingUser as any)._id || editingUser.username;
        let updatePayload: Partial<User> = { 
          ...baseUserData,
          username: formData.username || editingUser.username
        };

        if (isResetPasswordOpen && formData.password) {
          updatePayload.password = formData.password;
        }
        
        await updateRecord('users', finalId, updatePayload);
        toast({ title: "User Updated", description: "User access permissions and plant assignments saved." });
        success = true;
      } else {
        await addRecord('users', { ...baseUserData, password: formData.password! });
        toast({ title: "User Created", description: `${baseUserData.fullName} (${baseUserData.role}) created successfully.` });
        success = true;
      }
    } catch (error) {
      console.error("Failed to save user:", error);
      toast({ variant: "destructive", title: "Operation Failed", description: "Could not save user data. Please try again." });
    } finally {
      setIsProcessing(false);
      if (success) {
        setIsUserModalOpen(false);
        setIsResetPasswordOpen(false);
      }
    }
  };

  const handleStatusToggle = () => {
    if (!userToAction || isProcessing) return;
    
    setIsProcessing(true);
    try {
      const newStatus = userToAction.status === 'Active' ? 'Inactive' : 'Active';
      const finalId = userToAction.id || (userToAction as any)._id;
      updateRecord('users', finalId, { status: newStatus });
      toast({ 
        title: newStatus === 'Active' ? "User Activated" : "User Deactivated", 
        description: `${userToAction.fullName} account is now ${newStatus.toLowerCase()}.` 
      });
      setIsStatusAlertOpen(false);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleGlobalPermissionsUpdate = () => {
    if (!formData.permissions || formData.permissions.length === 0) {
      toast({ variant: "destructive", title: "Action Blocked", description: "Select at least one page permission to apply globally." });
      return;
    }

    setIsProcessing(true);
    try {
      users.forEach(u => {
        if (u.role !== 'SUPER_ADMIN') {
          const finalId = u.id || (u as any)._id;
          updateRecord('users', finalId, { permissions: formData.permissions });
        }
      });
      toast({ title: "Global Update Success", description: "Selected page permissions applied to all managed users." });
    } finally {
      setIsProcessing(false);
    }
  };

  if (!isMounted) return null;

  return (
    <TooltipProvider>
      <div className="space-y-6 pb-12">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <ShieldCheck className="w-7 h-7 text-primary" />
              Access Control & User Management
            </h1>
            <p className="text-muted-foreground text-sm">
              Provision security users and administrators with dynamic plant and module access.
            </p>
          </div>
          <Button 
            className="font-bold shadow-lg shadow-primary/20 bg-primary h-11 px-5 rounded-xl gap-2" 
            onClick={() => handleOpenModal()} 
            disabled={isProcessing}
          >
            <UserPlus className="w-5 h-5" />
            Create Security User
          </Button>
        </div>

        <Card className="border-slate-200 shadow-sm overflow-hidden rounded-2xl">
          <CardHeader className="border-b border-slate-100 bg-slate-50/50 p-4">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input 
                placeholder="Search users by name, username, or role..." 
                className="pl-10 h-10 bg-white rounded-xl border-slate-200 shadow-sm" 
                value={searchTerm} 
                onChange={(e) => setSearchTerm(e.target.value)} 
              />
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader className="bg-slate-50">
                <TableRow>
                  <TableHead className="font-bold">Full Name</TableHead>
                  <TableHead className="font-bold">Username</TableHead>
                  <TableHead className="font-bold">Role</TableHead>
                  <TableHead className="font-bold text-center">Status</TableHead>
                  <TableHead className="font-bold">Plant Access</TableHead>
                  <TableHead className="font-bold">Module Access</TableHead>
                  <TableHead className="text-right font-bold pr-6">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredUsers.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-12 text-slate-400">
                      No matching user accounts found.
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredUsers.map((user) => {
                    const isAllPlants = user.plantIds?.includes("*") || 
                      (plants && plants.length > 0 && user.plantIds && user.plantIds.length >= plants.length);
                    const isAllPages = user.permissions?.includes("*") || 
                      (user.permissions && user.permissions.length >= APP_MODULES.length);

                    return (
                      <TableRow key={user.id || (user as any)._id} className="hover:bg-slate-50/60 transition-colors">
                        <TableCell className="font-bold text-slate-800">
                          {user.fullName}
                        </TableCell>
                        <TableCell className="font-mono text-primary text-xs font-semibold">
                          @{user.username}
                        </TableCell>
                        <TableCell>
                          <Badge 
                            className={cn(
                              "text-[10px] font-black uppercase tracking-wider py-0.5 px-2.5 rounded-md border shadow-none",
                              user.role === 'SUPER_ADMIN' ? "bg-slate-900 text-white border-slate-800" :
                              user.role === 'SECURITY' ? "bg-purple-100 text-purple-800 border-purple-200" :
                              user.role === 'ADMIN' ? "bg-blue-100 text-blue-800 border-blue-200" :
                              user.role === 'HR' ? "bg-amber-100 text-amber-800 border-amber-200" :
                              "bg-slate-100 text-slate-700 border-slate-200"
                            )}
                          >
                            {user.role}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge 
                            className={cn(
                              "text-[9px] font-black uppercase py-0.5 px-2",
                              user.status === 'Active' ? "bg-emerald-500 hover:bg-emerald-600 text-white" : "bg-slate-300 text-slate-700"
                            )}
                          >
                            {user.status || 'Active'}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {isAllPlants ? (
                            <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200 text-[10px] font-bold gap-1 py-0.5">
                              <Check className="w-3 h-3" /> All Plants Access
                            </Badge>
                          ) : (user.plantIds && user.plantIds.length > 0) ? (
                            <Badge variant="secondary" className="bg-slate-100 text-slate-700 text-[10px] font-bold gap-1 py-0.5">
                              <Factory className="w-3 h-3 text-slate-500" />
                              {user.plantIds.length} {user.plantIds.length === 1 ? 'Plant' : 'Plants'}
                            </Badge>
                          ) : (
                            <span className="text-xs text-slate-400 italic">No plants</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {isAllPages ? (
                            <Badge className="bg-indigo-50 text-indigo-700 border-indigo-200 text-[10px] font-bold gap-1 py-0.5">
                              <Check className="w-3 h-3" /> All Pages Access
                            </Badge>
                          ) : (user.permissions && user.permissions.length > 0) ? (
                            <div className="flex flex-wrap gap-1 max-w-[260px]">
                              {user.permissions.slice(0, 3).map(p => (
                                <Badge key={String(p)} variant="secondary" className="text-[9px] bg-slate-100 border-none font-bold">
                                  {APP_MODULES.find(m => m.id === p)?.name || p}
                                </Badge>
                              ))}
                              {user.permissions.length > 3 && (
                                <Badge variant="secondary" className="text-[9px] bg-primary/10 text-primary border-none font-bold">
                                  +{user.permissions.length - 3} more
                                </Badge>
                              )}
                            </div>
                          ) : (
                            <span className="text-xs text-slate-400 italic">No pages</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right pr-6">
                          <div className="flex justify-end items-center gap-1">
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button 
                                  variant="ghost" 
                                  size="icon" 
                                  className="h-8 w-8 text-slate-500 hover:text-primary hover:bg-primary/5 rounded-lg"
                                  onClick={() => handleOpenModal(user)}
                                  disabled={isProcessing}
                                >
                                  <Pencil className="w-4 h-4" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Edit Access & Permissions</TooltipContent>
                            </Tooltip>

                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button 
                                  variant="ghost" 
                                  size="icon" 
                                  className="h-8 w-8 text-slate-500 hover:text-amber-600 hover:bg-amber-50 rounded-lg"
                                  onClick={() => { setUserToAction(user); setIsResetPasswordOpen(true); }}
                                  disabled={isProcessing}
                                >
                                  <Key className="w-4 h-4" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Change Password</TooltipContent>
                            </Tooltip>

                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button 
                                  variant="ghost" 
                                  size="icon" 
                                  className={cn(
                                    "h-8 w-8 rounded-lg",
                                    user.status === 'Inactive' 
                                      ? "text-emerald-500 hover:text-emerald-600 hover:bg-emerald-50" 
                                      : "text-rose-500 hover:text-rose-600 hover:bg-rose-50"
                                  )}
                                  onClick={() => { setUserToAction(user); setIsStatusAlertOpen(true); }}
                                  disabled={isProcessing || user.role === 'SUPER_ADMIN'}
                                >
                                  {user.status === 'Inactive' ? <UserCheck className="w-4 h-4" /> : <Trash2 className="w-4 h-4" />}
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>{user.status === 'Inactive' ? 'Activate User' : 'Deactivate User'}</TooltipContent>
                            </Tooltip>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Create / Edit User Dialog */}
        <Dialog open={isUserModalOpen} onOpenChange={(o) => { if (!o) setIsUserModalOpen(false); }}>
          <DialogContent className="sm:max-w-5xl h-[90vh] flex flex-col p-0 overflow-hidden border-none shadow-2xl rounded-2xl">
            <DialogHeader className="p-4 sm:p-5 shrink-0 border-b bg-white z-10">
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <DialogTitle className="text-xl font-black flex items-center gap-2.5 text-slate-900 leading-tight">
                    <div className="w-9 h-9 bg-primary/10 rounded-xl flex items-center justify-center shrink-0">
                      <ShieldCheck className="w-5 h-5 text-primary" />
                    </div>
                    {editingUser ? `Edit Access: ${editingUser.fullName}` : "Create New Security / System User"}
                  </DialogTitle>
                  <DialogDescription className="text-xs text-slate-500 font-medium">
                    Configure identity, user role, and select plant boundaries and page permissions.
                  </DialogDescription>
                </div>
              </div>
            </DialogHeader>
            
            <ScrollArea className="flex-1 px-6 sm:px-8 py-6 custom-blue-scrollbar bg-slate-50/50">
              <div className="space-y-8 pb-16">
                
                {/* Section 1: User Account Details */}
                <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-sm space-y-6">
                  <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
                    <Users className="w-4 h-4 text-primary" />
                    <h3 className="text-xs font-black uppercase tracking-[0.15em] text-slate-800">
                      Account Credentials & Role
                    </h3>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="space-y-2">
                      <Label className="text-[10px] font-black uppercase text-slate-500 tracking-wider">
                        Full Name *
                      </Label>
                      <Input 
                        placeholder="e.g. Ramesh Kumar"
                        value={formData.fullName || ""} 
                        onChange={(e) => setFormData(p => ({...p, fullName: e.target.value}))} 
                        className="h-12 bg-white border-slate-200 font-bold text-base rounded-xl shadow-sm focus-visible:ring-primary"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label className="text-[10px] font-black uppercase text-slate-500 tracking-wider">
                        Username *
                      </Label>
                      <Input 
                        placeholder="e.g. sec_ramesh"
                        value={formData.username || ""} 
                        onChange={(e) => setFormData(p => ({...p, username: e.target.value.toLowerCase().replace(/\s/g, '')}))} 
                        disabled={editingUser?.role === 'SUPER_ADMIN'} 
                        className="h-12 bg-white border-slate-200 font-mono text-base rounded-xl shadow-sm focus-visible:ring-primary disabled:bg-slate-100 disabled:text-slate-400"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label className="text-[10px] font-black uppercase text-slate-500 tracking-wider">
                        User Role *
                      </Label>
                      <Select 
                        value={formData.role || "SECURITY"} 
                        onValueChange={(val) => setFormData(p => ({ ...p, role: val as Role }))}
                        disabled={editingUser?.role === 'SUPER_ADMIN'}
                      >
                        <SelectTrigger className="h-12 bg-white border-slate-200 rounded-xl font-bold text-sm shadow-sm">
                          <SelectValue placeholder="Select Role" />
                        </SelectTrigger>
                        <SelectContent className="rounded-xl border-slate-200 shadow-xl">
                          <SelectItem value="SECURITY" className="font-bold py-2.5">
                            Security User (Gate / Plant Security)
                          </SelectItem>
                          <SelectItem value="HR" className="font-bold py-2.5">
                            Human Resources (HR Manager)
                          </SelectItem>
                          <SelectItem value="ADMIN" className="font-bold py-2.5">
                            Administrator (System Admin)
                          </SelectItem>
                          <SelectItem value="USER" className="font-bold py-2.5">
                            Standard User
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {!editingUser && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
                      <div className="space-y-2">
                        <Label className="text-[10px] font-black uppercase text-slate-500 tracking-wider">
                          Initial Password *
                        </Label>
                        <div className="relative">
                          <Input 
                            type={showPassword ? "text" : "password"}
                            placeholder="Enter secure password"
                            value={formData.password || ""} 
                            onChange={(e) => setFormData(p => ({...p, password: e.target.value}))} 
                            className="h-12 bg-white border-slate-200 font-mono text-base pr-12 rounded-xl shadow-sm focus-visible:ring-primary"
                          />
                          <button 
                            type="button"
                            className="absolute right-3.5 top-3.5 text-slate-400 hover:text-primary transition-colors"
                            onClick={() => setShowPassword(!showPassword)}
                          >
                            {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                          </button>
                        </div>
                      </div>

                      <div className="space-y-3 bg-slate-50 p-4 rounded-xl border border-slate-200/60">
                        <div className="flex justify-between items-center">
                          <span className="text-[10px] font-black uppercase text-slate-500 tracking-wider">
                            Password Strength
                          </span>
                          <Badge className={cn("text-[9px] font-black uppercase tracking-wider px-2 py-0.5", 
                            passwordStrength.label === 'STRONG' ? "bg-emerald-500 text-white" : 
                            passwordStrength.label === 'MEDIUM' ? "bg-amber-500 text-white" : 
                            passwordStrength.label === 'WEAK' ? "bg-rose-500 text-white" : "bg-slate-200 text-slate-500"
                          )}>
                            {passwordStrength.label}
                          </Badge>
                        </div>
                        <div className="h-1.5 w-full bg-slate-200 rounded-full overflow-hidden flex gap-1">
                          <div className={cn("h-full transition-all duration-500 rounded-full", passwordStrength.score >= 1 ? passwordStrength.color : "bg-transparent")} style={{ width: '25%' }} />
                          <div className={cn("h-full transition-all duration-500 rounded-full", passwordStrength.score >= 2 ? passwordStrength.color : "bg-transparent")} style={{ width: '25%' }} />
                          <div className={cn("h-full transition-all duration-500 rounded-full", passwordStrength.score >= 3 ? passwordStrength.color : "bg-transparent")} style={{ width: '25%' }} />
                          <div className={cn("h-full transition-all duration-500 rounded-full", passwordStrength.score >= 4 ? passwordStrength.color : "bg-transparent")} style={{ width: '25%' }} />
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Section 2: Plant Access Control */}
                <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-sm space-y-5">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
                    <div>
                      <h3 className="text-xs font-black uppercase tracking-[0.15em] text-slate-900 flex items-center gap-2">
                        <Factory className="w-4 h-4 text-primary" /> 
                        Plant Access (Location Bounds)
                      </h3>
                      <p className="text-[11px] text-muted-foreground font-medium mt-0.5">
                        Select one, multiple, or all registered plants for attendance gate authority.
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button 
                        variant={isAllPlantsSelected ? "default" : "outline"} 
                        size="sm" 
                        className={cn(
                          "h-8 px-3 text-[11px] font-bold rounded-lg gap-1.5",
                          isAllPlantsSelected ? "bg-emerald-600 hover:bg-emerald-700 text-white" : "border-slate-200"
                        )} 
                        onClick={handleToggleAllPlants} 
                        disabled={isProcessing}
                      >
                        {isAllPlantsSelected ? <CheckSquare className="w-3.5 h-3.5" /> : <Square className="w-3.5 h-3.5" />}
                        {isAllPlantsSelected ? "All Plants Selected" : "Select All Plants"}
                      </Button>
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        className="h-8 px-3 text-[11px] font-bold text-rose-600 hover:bg-rose-50 rounded-lg" 
                        onClick={() => setFormData(p => ({ ...p, plantIds: [] }))} 
                        disabled={isProcessing}
                      >
                        Clear
                      </Button>
                    </div>
                  </div>

                  {/* "All Plants" Hero Selection Card */}
                  <div 
                    onClick={handleToggleAllPlants}
                    className={cn(
                      "p-4 rounded-xl border-2 transition-all cursor-pointer select-none flex items-center justify-between gap-4",
                      isAllPlantsSelected 
                        ? "bg-emerald-50/80 border-emerald-500 shadow-sm ring-2 ring-emerald-500/10" 
                        : "bg-slate-50/70 border-slate-200 hover:border-slate-300"
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <Checkbox 
                        checked={isAllPlantsSelected}
                        onCheckedChange={handleToggleAllPlants}
                        className="data-[state=checked]:bg-emerald-600 data-[state=checked]:border-emerald-600 h-5 w-5 rounded-md"
                      />
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-black text-sm text-slate-900">All Plants Access</span>
                          <Badge className="bg-emerald-600 text-white text-[9px] font-black uppercase px-2 py-0">
                            Universal Access
                          </Badge>
                        </div>
                        <p className="text-xs text-slate-500 font-medium">
                          Authorize user across all current and future manufacturing plants and logistics units.
                        </p>
                      </div>
                    </div>
                    <Badge variant="outline" className="font-mono text-xs font-bold border-slate-300">
                      {plants?.length || 0} Total Plants
                    </Badge>
                  </div>

                  {/* Search Filter for Plants */}
                  <div className="relative">
                    <SearchIcon className="absolute left-3.5 top-3 h-4 w-4 text-slate-400" />
                    <Input 
                      placeholder="Search plants by name or code..." 
                      className="pl-10 h-10 bg-slate-50/60 border-slate-200 rounded-xl text-sm shadow-none focus-visible:bg-white"
                      value={plantSearch}
                      onChange={(e) => setPlantSearch(e.target.value)}
                    />
                  </div>

                  {/* Dynamic Plant Cards Grid */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {filteredPlants.length === 0 ? (
                      <div className="col-span-full py-6 text-center text-slate-400 text-sm italic">
                        No plants found matching &ldquo;{plantSearch}&rdquo;.
                      </div>
                    ) : (
                      filteredPlants.map(plant => {
                        const plantId = plant.id || (plant as any)._id;
                        const selected = isPlantChecked(plantId);

                        return (
                          <div 
                            key={plantId}
                            onClick={() => !isProcessing && handleTogglePlant(plantId)}
                            className={cn(
                              "flex items-start gap-3 p-3.5 rounded-xl border transition-all cursor-pointer select-none group",
                              selected 
                                ? "bg-primary/5 border-primary shadow-sm" 
                                : "bg-slate-50/40 border-slate-200 hover:border-slate-300 hover:bg-white"
                            )}
                          >
                            <Checkbox 
                              checked={selected}
                              onCheckedChange={() => handleTogglePlant(plantId)}
                              disabled={isProcessing}
                              className="border-slate-300 data-[state=checked]:bg-primary data-[state=checked]:border-primary h-4 w-4 rounded mt-0.5"
                            />
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-bold text-slate-800 leading-tight truncate">
                                {plant.name}
                              </p>
                              <div className="flex items-center gap-2 mt-1">
                                {plant.code && (
                                  <Badge variant="outline" className="text-[9px] font-mono px-1 py-0 uppercase border-slate-200">
                                    {plant.code}
                                  </Badge>
                                )}
                                <span className="text-[10px] text-slate-400 font-medium truncate">
                                  {plant.address || "Registered Node"}
                                </span>
                              </div>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>

                {/* Section 3: Page/Module Access Control */}
                <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-sm space-y-5">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
                    <div>
                      <h3 className="text-xs font-black uppercase tracking-[0.15em] text-slate-900 flex items-center gap-2">
                        <Layers className="w-4 h-4 text-primary" /> 
                        Page & Module Access Control
                      </h3>
                      <p className="text-[11px] text-muted-foreground font-medium mt-0.5">
                        Select one, multiple, or all system pages this user is permitted to open.
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Button 
                        variant={isAllPagesSelected ? "default" : "outline"} 
                        size="sm" 
                        className={cn(
                          "h-8 px-3 text-[11px] font-bold rounded-lg gap-1.5",
                          isAllPagesSelected ? "bg-indigo-600 hover:bg-indigo-700 text-white" : "border-slate-200"
                        )} 
                        onClick={handleToggleAllPages} 
                        disabled={isProcessing}
                      >
                        {isAllPagesSelected ? <CheckSquare className="w-3.5 h-3.5" /> : <Square className="w-3.5 h-3.5" />}
                        {isAllPagesSelected ? "All Pages Selected" : "Select All Pages"}
                      </Button>
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        className="h-8 px-3 text-[11px] font-bold text-rose-600 hover:bg-rose-50 rounded-lg" 
                        onClick={() => setFormData(p => ({ ...p, permissions: [] }))} 
                        disabled={isProcessing}
                      >
                        Clear
                      </Button>
                      <Button 
                        variant="secondary" 
                        size="sm" 
                        className="h-8 px-3 text-[11px] font-black uppercase tracking-wider bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 rounded-lg gap-1.5"
                        onClick={handleGlobalPermissionsUpdate}
                        disabled={isProcessing}
                      >
                        <Globe className="w-3.5 h-3.5" /> Apply Globally
                      </Button>
                    </div>
                  </div>

                  {/* "All Pages" Hero Selection Card */}
                  <div 
                    onClick={handleToggleAllPages}
                    className={cn(
                      "p-4 rounded-xl border-2 transition-all cursor-pointer select-none flex items-center justify-between gap-4",
                      isAllPagesSelected 
                        ? "bg-indigo-50/80 border-indigo-500 shadow-sm ring-2 ring-indigo-500/10" 
                        : "bg-slate-50/70 border-slate-200 hover:border-slate-300"
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <Checkbox 
                        checked={isAllPagesSelected}
                        onCheckedChange={handleToggleAllPages}
                        className="data-[state=checked]:bg-indigo-600 data-[state=checked]:border-indigo-600 h-5 w-5 rounded-md"
                      />
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-black text-sm text-slate-900">All Pages (Full Access)</span>
                          <Badge className="bg-indigo-600 text-white text-[9px] font-black uppercase px-2 py-0">
                            Universal Access
                          </Badge>
                        </div>
                        <p className="text-xs text-slate-500 font-medium">
                          Grants unrestricted navigation across all dashboard sections and administrative pages.
                        </p>
                      </div>
                    </div>
                    <Badge variant="outline" className="font-mono text-xs font-bold border-slate-300">
                      {APP_MODULES.length} Master Modules
                    </Badge>
                  </div>

                  {/* Search Filter for Pages */}
                  <div className="relative">
                    <SearchIcon className="absolute left-3.5 top-3 h-4 w-4 text-slate-400" />
                    <Input 
                      placeholder="Search modules by name or description..." 
                      className="pl-10 h-10 bg-slate-50/60 border-slate-200 rounded-xl text-sm shadow-none focus-visible:bg-white"
                      value={moduleSearch}
                      onChange={(e) => setModuleSearch(e.target.value)}
                    />
                  </div>

                  {/* Dynamic Master Module Cards Grid */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
                    {filteredModules.map(module => {
                      const selected = isPageChecked(module.id);
                      const IconComponent = module.icon;

                      return (
                        <div 
                          key={module.id}
                          onClick={() => !isProcessing && handleTogglePage(module.id)}
                          className={cn(
                            "flex items-start gap-3 p-4 rounded-xl border transition-all cursor-pointer select-none group",
                            selected 
                              ? "bg-primary/5 border-primary shadow-sm ring-1 ring-primary/20" 
                              : "bg-slate-50/40 border-slate-200 hover:border-slate-300 hover:bg-white"
                          )}
                        >
                          <Checkbox 
                            checked={selected}
                            onCheckedChange={() => handleTogglePage(module.id)}
                            disabled={isProcessing}
                            className="border-slate-300 data-[state=checked]:bg-primary data-[state=checked]:border-primary h-4 w-4 rounded mt-1"
                          />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-1 mb-1">
                              <div className="flex items-center gap-1.5 truncate">
                                <IconComponent className={cn("w-4 h-4 shrink-0", selected ? "text-primary" : "text-slate-500")} />
                                <span className="text-sm font-bold text-slate-900 leading-tight truncate">
                                  {module.name}
                                </span>
                              </div>
                              <Badge variant="outline" className="text-[9px] font-bold px-1.5 py-0 border-slate-200 shrink-0">
                                {module.category}
                              </Badge>
                            </div>
                            <p className="text-[11px] text-slate-500 leading-snug line-clamp-2">
                              {module.description}
                            </p>
                            <p className="text-[9px] font-mono text-slate-400 mt-1 truncate">
                              {module.path}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

              </div>
            </ScrollArea>

            <DialogFooter className="p-4 bg-slate-50 border-t shrink-0 z-10">
              <div className="flex justify-end gap-3 w-full">
                <Button 
                  variant="ghost" 
                  onClick={() => setIsUserModalOpen(false)} 
                  className="rounded-xl font-bold h-11 px-6 text-slate-600 hover:bg-slate-200"
                >
                  Cancel
                </Button>
                <Button 
                  onClick={handleSaveUser} 
                  disabled={isProcessing}
                  className="bg-primary hover:bg-primary/90 rounded-xl font-black h-11 px-8 shadow-lg shadow-primary/20 text-sm gap-2"
                >
                  <Check className="w-4 h-4" />
                  {isProcessing ? "Saving..." : editingUser ? "Save Access Changes" : "Create Security User"}
                </Button>
              </div>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Change Password Dialog */}
        <Dialog open={isResetPasswordOpen} onOpenChange={(o) => { if (!o) setIsResetPasswordOpen(false); }}>
          <DialogContent className="sm:max-w-md rounded-2xl border-none shadow-2xl">
            <DialogHeader>
              <DialogTitle className="text-xl font-black flex items-center gap-2">
                <Key className="w-5 h-5 text-primary" />
                Update User Password
              </DialogTitle>
              <DialogDescription className="font-medium text-xs">
                Set a new secure password for <strong>{userToAction?.fullName}</strong> (@{userToAction?.username})
              </DialogDescription>
            </DialogHeader>
            <div className="py-4 space-y-4">
              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase text-slate-500 tracking-wider">
                  New Password
                </Label>
                <Input 
                  type="password"
                  placeholder="Min 6 characters"
                  className="h-12 bg-slate-50 border-slate-200 rounded-xl font-mono text-sm"
                  value={formData.password || ""}
                  onChange={(e) => setFormData(p => ({...p, password: e.target.value}))}
                />
              </div>
            </div>
            <DialogFooter className="bg-slate-50 -m-6 mt-2 p-4 rounded-b-2xl border-t gap-2">
              <Button variant="ghost" onClick={() => setIsResetPasswordOpen(false)} className="rounded-xl font-bold">
                Cancel
              </Button>
              <Button 
                onClick={handleSaveUser} 
                disabled={isProcessing || !formData.password || formData.password.length < 6} 
                className="bg-primary rounded-xl font-black px-6 shadow-md shadow-primary/20"
              >
                {isProcessing ? "Updating..." : "Update Password"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Status Confirmation Alert */}
        <AlertDialog open={isStatusAlertOpen} onOpenChange={setIsStatusAlertOpen}>
          <AlertDialogContent className="rounded-2xl border-none shadow-2xl">
            <AlertDialogHeader>
              <div className={cn(
                "mx-auto w-14 h-14 rounded-2xl flex items-center justify-center mb-3",
                userToAction?.status === 'Inactive' ? "bg-emerald-50 text-emerald-500" : "bg-rose-50 text-rose-500"
              )}>
                {userToAction?.status === 'Inactive' ? (
                  <UserCheck className="w-7 h-7" />
                ) : (
                  <AlertTriangle className="w-7 h-7" />
                )}
              </div>
              <AlertDialogTitle className="text-center text-xl font-black">
                Confirm User {userToAction?.status === 'Inactive' ? 'Activation' : 'Deactivation'}
              </AlertDialogTitle>
              <AlertDialogDescription className="text-center text-slate-500 font-medium pt-1 text-xs">
                Are you sure you want to <strong>{userToAction?.status === 'Inactive' ? 'activate' : 'deactivate'}</strong> <strong>{userToAction?.fullName}</strong>? 
                {userToAction?.status === 'Active' && " They will be immediately blocked from signing into the portal."}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter className="sm:justify-center gap-3 pt-6 pb-2">
              <AlertDialogCancel className="rounded-xl font-bold h-11 px-6">Cancel</AlertDialogCancel>
              <AlertDialogAction 
                onClick={(e) => {
                  e.preventDefault();
                  handleStatusToggle();
                }} 
                disabled={isProcessing}
                className={cn(
                  "rounded-xl font-black h-11 px-6 shadow-lg",
                  userToAction?.status === 'Inactive' 
                    ? "bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-100" 
                    : "bg-rose-600 hover:bg-rose-700 text-white shadow-rose-100"
                )}
              >
                {isProcessing ? "Processing..." : `Confirm ${userToAction?.status === 'Inactive' ? 'Activate' : 'Deactivate'}`}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </TooltipProvider>
  );
}