/**
 * SyncStatusIndicator - 同步状态指示器
 * 
 * 仅在状态变化时显示，同步成功后自动消失
 */

import React, { useState, useEffect, useRef } from 'react';
import { Cloud, CloudOff, RefreshCw, Check, AlertCircle, CloudUpload } from 'lucide-react';
import { SyncStatus } from '../../types';

interface SyncStatusIndicatorProps {
    status: SyncStatus;
    lastSyncTime: number | null;
    onManualSync?: () => void;
    onManualPull?: () => void;
    className?: string;
}

// 自动隐藏延迟 (毫秒)
const AUTO_HIDE_DELAY = 2500;

const SyncStatusIndicator: React.FC<SyncStatusIndicatorProps> = ({
    status,
    lastSyncTime,
    onManualSync,
    onManualPull,
    className = ''
}) => {
    const [visible, setVisible] = useState(false);
    const [isExiting, setIsExiting] = useState(false);
    const hideTimer = useRef<NodeJS.Timeout | null>(null);
    const prevStatus = useRef<SyncStatus>(status);

    // 清除定时器
    const clearHideTimer = () => {
        if (hideTimer.current) {
            clearTimeout(hideTimer.current);
            hideTimer.current = null;
        }
    };

    // 开始隐藏动画
    const startHide = () => {
        setIsExiting(true);
        setTimeout(() => {
            setVisible(false);
            setIsExiting(false);
        }, 300); // 动画持续时间
    };

    // 安排自动隐藏
    const scheduleHide = () => {
        clearHideTimer();
        hideTimer.current = setTimeout(startHide, AUTO_HIDE_DELAY);
    };

    // 监听状态变化
    useEffect(() => {
        // idle 状态不显示
        if (status === 'idle') {
            if (visible) startHide();
            return;
        }

        // 状态发生变化时显示
        if (status !== prevStatus.current) {
            prevStatus.current = status;
            setVisible(true);
            setIsExiting(false);
            clearHideTimer();

            // synced 状态自动隐藏
            if (status === 'synced') {
                scheduleHide();
            }
        }
    }, [status]);

    // 清理
    useEffect(() => {
        return () => clearHideTimer();
    }, []);

    const getStatusConfig = () => {
        switch (status) {
            case 'synced':
                return {
                    icon: Check,
                    color: 'text-green-500',
                    bgColor: 'bg-green-500/10 dark:bg-green-500/20',
                    borderColor: 'border-green-500/30',
                    label: '已同步',
                    animate: false
                };
            case 'syncing':
                return {
                    icon: RefreshCw,
                    color: 'text-blue-500',
                    bgColor: 'bg-blue-500/10 dark:bg-blue-500/20',
                    borderColor: 'border-blue-500/30',
                    label: '同步中',
                    animate: true
                };
            case 'pending':
                return {
                    icon: CloudUpload,
                    color: 'text-orange-500',
                    bgColor: 'bg-orange-500/10 dark:bg-orange-500/20',
                    borderColor: 'border-orange-500/30',
                    label: '待同步',
                    animate: false
                };
            case 'error':
                return {
                    icon: AlertCircle,
                    color: 'text-red-500',
                    bgColor: 'bg-red-500/10 dark:bg-red-500/20',
                    borderColor: 'border-red-500/30',
                    label: '同步失败',
                    animate: false
                };
            case 'conflict':
                return {
                    icon: CloudOff,
                    color: 'text-amber-500',
                    bgColor: 'bg-amber-500/10 dark:bg-amber-500/20',
                    borderColor: 'border-amber-500/30',
                    label: '有冲突',
                    animate: false
                };
            default:
                return {
                    icon: Cloud,
                    color: 'text-slate-400',
                    bgColor: 'bg-slate-400/10',
                    borderColor: 'border-slate-400/30',
                    label: '待连接',
                    animate: false
                };
        }
    };

    // 不显示时返回空
    if (!visible) return null;

    const config = getStatusConfig();
    const Icon = config.icon;

    // 点击处理
    const handleClick = () => {
        if (status === 'error') {
            onManualSync?.();
        } else {
            onManualPull?.();
        }
    };

    return (
        <button
            onClick={handleClick}
            className={`
        flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium
        ${config.bgColor} ${config.borderColor} border
        backdrop-blur-sm shadow-lg
        transition-all duration-300 ease-out
        hover:scale-105 active:scale-95
        ${isExiting ? 'opacity-0 translate-y-2' : 'opacity-100 translate-y-0'}
        ${className}
      `}
            disabled={status === 'syncing'}
            title={status === 'error' ? '点击重试' : '点击刷新'}
        >
            <Icon
                className={`w-4 h-4 ${config.color} ${config.animate ? 'animate-spin' : ''}`}
            />
            <span className={config.color}>{config.label}</span>
        </button>
    );
};

export default SyncStatusIndicator;

