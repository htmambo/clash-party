import BasePage from '@renderer/components/base/base-page'
import LogItem from '@renderer/components/logs/log-item'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Button, Divider, Input } from '@heroui/react'
import { Virtuoso, VirtuosoHandle } from 'react-virtuoso'
import { IoLocationSharp } from 'react-icons/io5'
import { CgTrash } from 'react-icons/cg'
import { useTranslation } from 'react-i18next'
import { includesIgnoreCase } from '@renderer/utils/includes'

// ============================================================================
// Constants
// ============================================================================

const LOGS_FILTER_KEY = 'logs-filter'

/** 最大保留的日志条数，防止内存无限增长 */
const MAX_LOGS = 500

/** 日志更新节流时间（毫秒），减少 UI 更新频率 */
const LOGS_UPDATE_THROTTLE_MS = 150

// ============================================================================
// Global Log Buffer with Batch Update
// ============================================================================

/**
 * 全局日志缓存和批量更新管理器
 *
 * 核心优化：
 * 1. 批量更新：多条日志合并为一次 setState，减少重新渲染
 * 2. requestAnimationFrame：对齐到浏览器重绘周期，提升流畅度
 * 3. 节流机制：避免高频更新阻塞 UI 线程
 * 4. 减少数组拷贝：只在批量刷新时创建快照
 */
const cachedLogs: {
  /** 日志数据 */
  log: IMihomoLogInfo[]
  /** 触发 React state 更新的回调 */
  trigger: ((logs: IMihomoLogInfo[]) => void) | null
  /** 是否有待处理的更新 */
  pending: boolean
  /** 上次刷新时间戳 */
  lastFlushAt: number
  /** requestAnimationFrame ID */
  rafId: number | null
  /** setTimeout ID */
  timeoutId: ReturnType<typeof setTimeout> | null
  /** 取消已调度的更新 */
  cancelScheduled(): void
  /** 立即执行批量更新 */
  flush(): void
  /** 调度批量更新（可选立即执行） */
  scheduleFlush(opts?: { immediate?: boolean }): void
  /** 追加单条日志 */
  append(log: IMihomoLogInfo): void
  /** 清空所有日志 */
  clean(): void
} = {
  log: [],
  trigger: null,
  pending: false,
  lastFlushAt: 0,
  rafId: null,
  timeoutId: null,

  /**
   * 取消已调度的更新
   * 用于组件卸载或清空日志时取消待处理的更新
   */
  cancelScheduled(): void {
    if (this.timeoutId !== null) {
      clearTimeout(this.timeoutId)
      this.timeoutId = null
    }
    if (this.rafId !== null) {
      window.cancelAnimationFrame(this.rafId)
      this.rafId = null
    }
  },

  /**
   * 执行批量更新
   * 将 pending 标记的日志数据批量推送到 React state
   */
  flush(): void {
    if (!this.pending) return

    this.pending = false
    const trigger = this.trigger
    if (trigger === null) return

    this.lastFlushAt = Date.now()
    // 仅在批量刷新时创建快照，避免每条日志都拷贝数组
    trigger(this.log.slice())
  },

  /**
   * 调度批量更新
   * 使用 requestAnimationFrame 对齐到浏览器重绘周期
   * 使用 setTimeout 实现节流
   */
  scheduleFlush(opts?: { immediate?: boolean }): void {
    if (this.trigger === null) return

    this.pending = true

    // 已经有定时/帧回调在路上，复用它即可（只保留最后一次数据）
    if (this.rafId !== null || this.timeoutId !== null) return

    const immediate = opts?.immediate === true
    const now = Date.now()
    const elapsed = now - this.lastFlushAt

    /**
     * 调度 requestAnimationFrame
     * 在下一帧重绘前批量更新，提升渲染性能
     */
    const scheduleRaf = (): void => {
      if (this.rafId !== null) return
      this.rafId = window.requestAnimationFrame(() => {
        this.rafId = null
        this.flush()
      })
    }

    // 达到节流窗口或显式要求立即刷新：在下一帧批量更新
    if (immediate || elapsed >= LOGS_UPDATE_THROTTLE_MS) {
      scheduleRaf()
      return
    }

    // 未到节流窗口：延迟到窗口结束后，再使用 rAF 对齐到绘制前批量更新
    const delay = Math.max(LOGS_UPDATE_THROTTLE_MS - elapsed, 0)
    this.timeoutId = setTimeout(() => {
      this.timeoutId = null
      scheduleRaf()
    }, delay)
  },

  /**
   * 追加单条日志
   * 自动维护日志数量上限，并调度批量更新
   */
  append(log: IMihomoLogInfo): void {
    this.log.push(log)
    if (this.log.length >= MAX_LOGS) {
      this.log.shift()
    }
    this.scheduleFlush()
  },

  /**
   * 清空所有日志
   * 用户主动操作，立即生效
   */
  clean(): void {
    this.log = []
    this.pending = false
    this.cancelScheduled()
    // 清除属于用户交互：保持"立即生效"的体验
    if (this.trigger !== null) this.trigger([])
  }
}

// ============================================================================
// IPC Event Listener
// ============================================================================

/**
 * 全局 IPC 监听器
 * 每次收到日志都追加到缓存，由批量更新机制统一处理
 */
window.electron.ipcRenderer.on('mihomoLogs', (_e, ...args) => {
  const log = args[0] as IMihomoLogInfo
  log.time = new Date().toLocaleString()
  cachedLogs.append(log)
})

// ============================================================================
// Logs Component
// ============================================================================

const Logs: React.FC = () => {
  const { t } = useTranslation()

  // 使用函数式初始化，避免组件挂载时拷贝数组
  const [logs, setLogs] = useState<IMihomoLogInfo[]>(() => cachedLogs.log.slice())

  const [filter, setFilter] = useState(() => {
    return localStorage.getItem(LOGS_FILTER_KEY) || ''
  })
  const [trace, setTrace] = useState(true)

  const virtuosoRef = useRef<VirtuosoHandle>(null)
  const filteredLogs = useMemo(() => {
    if (filter === '') return logs
    return logs.filter((log) => {
      return includesIgnoreCase(log.payload, filter) || includesIgnoreCase(log.type, filter)
    })
  }, [logs, filter])

  useEffect(() => {
    localStorage.setItem(LOGS_FILTER_KEY, filter)
  }, [filter])

  useEffect(() => {
    if (!trace) return
    virtuosoRef.current?.scrollToIndex({
      index: filteredLogs.length - 1,
      behavior: 'smooth',
      align: 'end',
      offset: 0
    })
  }, [filteredLogs, trace])

  // ============================================================================
  // Effects: Log Data Processing
  // ============================================================================

  /**
   * 注册日志更新回调
   * 核心优化：直接使用快照更新 state，避免数组拷贝
   */
  useEffect(() => {
    const old = cachedLogs.trigger

    // 直接使用 cachedLogs.flush() 传来的快照，避免再次拷贝
    cachedLogs.trigger = (snapshot): void => setLogs(snapshot)

    // 挂载后主动同步一次（若在 useEffect 前已有日志写入）
    cachedLogs.scheduleFlush({ immediate: true })

    return (): void => {
      cachedLogs.trigger = old
      // 如果当前没有其他组件订阅，取消待处理的更新
      if (cachedLogs.trigger === null) {
        cachedLogs.cancelScheduled()
      }
    }
  }, [])

  return (
    <BasePage title={t('logs.title')}>
      <div className="sticky top-0 z-40">
        <div className="w-full flex p-2">
          <Input
            size="sm"
            value={filter}
            placeholder={t('logs.filter')}
            isClearable
            onValueChange={setFilter}
          />
          <Button
            size="sm"
            isIconOnly
            className="ml-2"
            color={trace ? 'primary' : 'default'}
            variant={trace ? 'solid' : 'bordered'}
            title={t('logs.autoScroll')}
            onPress={() => {
              setTrace((prev) => !prev)
            }}
          >
            <IoLocationSharp className="text-lg" />
          </Button>
          <Button
            size="sm"
            isIconOnly
            title={t('logs.clear')}
            className="ml-2"
            variant="light"
            color="danger"
            onPress={() => {
              cachedLogs.clean()
            }}
          >
            <CgTrash className="text-lg" />
          </Button>
        </div>
        <Divider />
      </div>
      <div className="h-[calc(100vh-100px)] mt-px">
        <Virtuoso
          ref={virtuosoRef}
          data={filteredLogs}
          itemContent={(i, log) => (
            <LogItem index={i} time={log.time} type={log.type} payload={log.payload} />
          )}
        />
      </div>
    </BasePage>
  )
}

export default Logs
