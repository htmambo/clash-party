import BasePage from '@renderer/components/base/base-page'
import { mihomoCloseAllConnections, mihomoCloseConnection } from '@renderer/utils/ipc'
import { Key, useCallback, useEffect, useMemo, useState } from 'react'
import { Badge, Button, Divider, Input, Select, SelectItem, Tab, Tabs , Dropdown, DropdownTrigger, DropdownMenu, DropdownItem } from '@heroui/react'
import { calcTraffic } from '@renderer/utils/calc'
import ConnectionItem from '@renderer/components/connections/connection-item'
import ConnectionTable from '@renderer/components/connections/connection-table'
import { Virtuoso } from 'react-virtuoso'
import dayjs from '@renderer/utils/dayjs'
import ConnectionDetailModal from '@renderer/components/connections/connection-detail-modal'
import { CgClose, CgTrash } from 'react-icons/cg'
import { useAppConfig } from '@renderer/hooks/use-app-config'
import { HiSortAscending, HiSortDescending } from 'react-icons/hi'
import { MdViewList, MdTableChart } from 'react-icons/md'
import { HiOutlineAdjustmentsHorizontal } from 'react-icons/hi2'
import { includesIgnoreCase } from '@renderer/utils/includes'
import { useTranslation } from 'react-i18next'
import { IoMdPause, IoMdPlay } from 'react-icons/io'

// ============================================================================
// Constants
// ============================================================================

/** 最大保留的已关闭连接数，防止内存无限增长 */
const MAX_CLOSED_CONNECTIONS = 200

/** 连接更新节流时间（毫秒），减少 UI 更新频率 */
const CONNECTIONS_UPDATE_THROTTLE_MS = 300

/** 缓存所有连接数据，用于页面刷新后恢复 */
let cachedConnections: IMihomoConnectionDetail[] = []

const Connections: React.FC = () => {
  const { t } = useTranslation()
  const [filter, setFilter] = useState('')
  const { appConfig, patchAppConfig } = useAppConfig()
  const {
    connectionDirection = 'asc',
    connectionOrderBy = 'time',
    connectionViewMode = 'list',
    connectionTableColumns = [
      'status',
      'establishTime',
      'type',
      'host',
      'process',
      'rule',
      'proxyChain',
      'remoteDestination',
      'uploadSpeed',
      'downloadSpeed',
      'upload',
      'download'
    ],
    connectionTableColumnWidths,
    connectionTableSortColumn,
    connectionTableSortDirection
  } = appConfig || {}

  // ============================================================================
  // State Management
  // ============================================================================

  /**
   * 统一的连接状态管理
   * 将多个相关状态合并为一个，减少 setState 调用次数，从而减少重新渲染
   */
  type ConnectionsState = {
    connectionsInfo?: IMihomoConnectionsInfo
    allConnections: IMihomoConnectionDetail[]
    activeConnections: IMihomoConnectionDetail[]
    closedConnections: IMihomoConnectionDetail[]
  }

  const [connectionsState, setConnectionsState] = useState<ConnectionsState>(() => ({
    connectionsInfo: undefined,
    allConnections: cachedConnections,
    activeConnections: [],
    closedConnections: []
  }))

  const { connectionsInfo, allConnections, activeConnections, closedConnections } = connectionsState

  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false)
  const [selected, setSelected] = useState<IMihomoConnectionDetail>()
  const [tab, setTab] = useState('active')
  const [isPaused, setIsPaused] = useState(false)
  const [viewMode, setViewMode] = useState<'list' | 'table'>(connectionViewMode)
  const [visibleColumns, setVisibleColumns] = useState<Set<string>>(new Set(connectionTableColumns))

  // ============================================================================
  // Computed Values
  // ============================================================================

  const selectedConnection = useMemo(() => {
    if (!selected) return undefined
    return (
      activeConnections.find((c) => c.id === selected.id) ||
      closedConnections.find((c) => c.id === selected.id) ||
      selected
    )
  }, [selected, activeConnections, closedConnections])

  const handleColumnWidthChange = useCallback(
    async (widths: Record<string, number>) => {
      await patchAppConfig({ connectionTableColumnWidths: widths })
    },
    [patchAppConfig]
  )

  const handleSortChange = useCallback(
    async (column: string | null, direction: 'asc' | 'desc') => {
      await patchAppConfig({
        connectionTableSortColumn: column || undefined,
        connectionTableSortDirection: direction
      })
    },
    [patchAppConfig]
  )

  const filteredConnections = useMemo(() => {
    const connections = tab === 'active' ? activeConnections : closedConnections

    const filtered =
      filter === ''
        ? connections
        : connections.filter((connection) => {
            const raw = JSON.stringify(connection)
            return includesIgnoreCase(raw, filter)
          })

    if (viewMode === 'list' && connectionOrderBy) {
      return [...filtered].sort((a, b) => {
        let comparison = 0
        switch (connectionOrderBy) {
          case 'time':
            comparison = dayjs(a.start).unix() - dayjs(b.start).unix()
            break
          case 'upload':
            comparison = a.upload - b.upload
            break
          case 'download':
            comparison = a.download - b.download
            break
          case 'uploadSpeed':
            comparison = (a.uploadSpeed || 0) - (b.uploadSpeed || 0)
            break
          case 'downloadSpeed':
            comparison = (a.downloadSpeed || 0) - (b.downloadSpeed || 0)
            break
        }
        return connectionDirection === 'asc' ? comparison : -comparison
      })
    }

    return filtered
  }, [
    activeConnections,
    closedConnections,
    tab,
    filter,
    connectionDirection,
    connectionOrderBy,
    viewMode
  ])

  const closeAllConnections = useCallback((): void => {
    tab === 'active' ? mihomoCloseAllConnections() : trashAllClosedConnection()
  }, [tab])

  const closeConnection = useCallback(
    (id: string): void => {
      tab === 'active' ? mihomoCloseConnection(id) : trashClosedConnection(id)
    },
    [tab]
  )

  /**
   * 删除所有已关闭的连接
   * 使用统一的 setConnectionsState 减少 setState 调用
   */
  const trashAllClosedConnection = (): void => {
    setConnectionsState((prev) => {
      const trashIds = new Set(prev.closedConnections.map((conn) => conn.id))
      const filteredAll = prev.allConnections.filter((conn) => !trashIds.has(conn.id))
      cachedConnections = filteredAll
      return {
        ...prev,
        allConnections: filteredAll,
        closedConnections: []
      }
    })
  }

  /**
   * 删除单个已关闭的连接
   */
  const trashClosedConnection = (id: string): void => {
    setConnectionsState((prev) => {
      const filteredAll = prev.allConnections.filter((conn) => conn.id !== id)
      cachedConnections = filteredAll
      return {
        ...prev,
        allConnections: filteredAll,
        closedConnections: prev.closedConnections.filter((conn) => conn.id !== id)
      }
    })
  }

  // ============================================================================
  // Effects: Connection Data Processing
  // ============================================================================

  useEffect(() => {
    // --------------------------------------------------------------------
    // 节流状态管理
    // --------------------------------------------------------------------
    let lastFlushAt = 0
    let timer: ReturnType<typeof setTimeout> | null = null
    let pendingInfo: IMihomoConnectionsInfo | null = null

    // --------------------------------------------------------------------
    // 应用连接数据更新
    // --------------------------------------------------------------------
    /**
     * 核心优化：使用 O(n) 算法替代 O(n*m) 的 unionWith/differenceWith
     *
     * 性能改进点：
     * 1. 使用 Set 和 Map 索引，时间复杂度从 O(n*m) 降到 O(n)
     * 2. 合并三次 setState 为一次，减少重新渲染
     * 3. 增量更新，避免全量数组操作
     */
    const applyInfo = (info: IMihomoConnectionsInfo): void => {
      lastFlushAt = Date.now()

      setConnectionsState((prev) => {
        if (!info.connections) {
          return { ...prev, connectionsInfo: info }
        }

        // ----------------------------------------------------------------
        // 步骤 1: 构建 allConnections (去重合并)
        // 时间复杂度: O(n)，替代 unionWith 的 O(n*m)
        // ----------------------------------------------------------------
        const allConns: IMihomoConnectionDetail[] = []
        const seenIds = new Set<string>()

        // 先添加活跃连接（保持顺序）
        for (const conn of prev.activeConnections) {
          if (seenIds.has(conn.id)) continue
          seenIds.add(conn.id)
          allConns.push(conn)
        }

        // 再添加历史连接（去重）
        for (const conn of prev.allConnections) {
          if (seenIds.has(conn.id)) continue
          seenIds.add(conn.id)
          allConns.push(conn)
        }

        // ----------------------------------------------------------------
        // 步骤 2: 计算活跃连接（增量更新速度）
        // 使用 Map 索引加速查找：O(1) vs O(n)
        // ----------------------------------------------------------------
        const prevActiveById = new Map(prev.activeConnections.map((conn) => [conn.id, conn]))
        const activeIds = new Set<string>()
        const nextActiveConnections: IMihomoConnectionDetail[] = []

        for (const conn of info.connections) {
          activeIds.add(conn.id)
          const prevConn = prevActiveById.get(conn.id)
          nextActiveConnections.push({
            ...conn,
            isActive: true,
            // 增量计算速度：当前流量 - 上次流量
            downloadSpeed: prevConn ? conn.download - prevConn.download : 0,
            uploadSpeed: prevConn ? conn.upload - prevConn.upload : 0
          })
        }

        // ----------------------------------------------------------------
        // 步骤 3: 计算已关闭连接
        // 时间复杂度: O(n)，替代 differenceWith 的 O(n*m)
        // ----------------------------------------------------------------
        const nextClosedConnections: IMihomoConnectionDetail[] = []
        for (const conn of allConns) {
          if (activeIds.has(conn.id)) continue
          nextClosedConnections.push({
            ...conn,
            isActive: false,
            downloadSpeed: 0,
            uploadSpeed: 0
          })
        }

        // ----------------------------------------------------------------
        // 步骤 4: 限制 allConnections 大小，防止内存无限增长
        // ----------------------------------------------------------------
        const nextAllConnections = allConns.slice(
          -(nextActiveConnections.length + MAX_CLOSED_CONNECTIONS)
        )

        // 更新缓存（使用截断后的列表，与 state 保持一致）
        // 注意：这里缓存的是截断后的数据，而不是完整的 allConns
        // 这样可以确保刷新后的数据量可控，避免内存占用过大
        cachedConnections = nextAllConnections

        // ----------------------------------------------------------------
        // 步骤 5: 一次性更新所有状态（减少重新渲染）
        // ----------------------------------------------------------------
        return {
          ...prev,
          connectionsInfo: info,
          activeConnections: nextActiveConnections,
          closedConnections: nextClosedConnections,
          allConnections: nextAllConnections
        }
      })
    }

    // --------------------------------------------------------------------
    // 节流调度：批量处理高频更新
    // --------------------------------------------------------------------
    /**
     * 注意：节流会改变速度计算的时间间隔
     *
     * uploadSpeed/downloadSpeed 的计算方式是：当前累计流量 - 上次累计流量
     * 在无节流时，时间间隔 = IPC 推送间隔
     * 在有节流时，时间间隔 = max(节流时间, IPC 推送间隔)
     *
     * 这意味着：
     * - 如果 IPC 推送频率 = 1s，节流 300ms 几乎不影响速度语义
     * - 如果 IPC 推送频率 >> 300ms，速度值会变成"每节流间隔的增量"
     *
     * 当前实现中，速度字段主要反映相对大小（快/慢），而非严格的 bytes/s
     * 因此节流对用户体验的影响很小
     */
    const scheduleApply = (info: IMihomoConnectionsInfo): void => {
      pendingInfo = info
      if (timer !== null) return

      const now = Date.now()
      const delay = Math.max(CONNECTIONS_UPDATE_THROTTLE_MS - (now - lastFlushAt), 0)
      timer = setTimeout(() => {
        timer = null
        if (!pendingInfo) return
        const latest = pendingInfo
        pendingInfo = null
        applyInfo(latest)
      }, delay)
    }

    // --------------------------------------------------------------------
    // IPC 事件处理器（带节流）
    // --------------------------------------------------------------------
    const handler = (_e: unknown, ...args: unknown[]): void => {
      const info = args[0] as IMihomoConnectionsInfo

      // 禁用节流时直接应用
      if (CONNECTIONS_UPDATE_THROTTLE_MS <= 0) {
        applyInfo(info)
        return
      }

      // 节流逻辑：如果距离上次更新超过节流时间，立即应用；否则延迟应用
      const now = Date.now()
      if (now - lastFlushAt >= CONNECTIONS_UPDATE_THROTTLE_MS) {
        applyInfo(info)
      } else {
        scheduleApply(info)
      }
    }

    // 注册监听器
    if (!isPaused) {
      window.electron.ipcRenderer.on('mihomoConnections', handler)
    }

    // 清理函数
    return (): void => {
      window.electron.ipcRenderer.removeAllListeners('mihomoConnections')
      if (timer !== null) {
        clearTimeout(timer)
        timer = null
      }
      pendingInfo = null
    }
  }, [isPaused])
  const togglePause = useCallback(() => {
    setIsPaused((prev) => !prev)
  }, [])

  return (
    <BasePage
      title={t('connections.title')}
      header={
        <div className="flex">
          <div className="flex items-center">
            <span className="mx-1 text-gray-400">
              ↑ {calcTraffic(connectionsInfo?.uploadTotal ?? 0)}{' '}
            </span>
            <span className="mx-1 text-gray-400">
              ↓ {calcTraffic(connectionsInfo?.downloadTotal ?? 0)}{' '}
            </span>
          </div>
          <Badge
            className="mt-2"
            color="primary"
            variant="flat"
            showOutline={false}
            content={filteredConnections.length}
          >
            <Button
              className="app-nodrag ml-1"
              title={
                viewMode === 'list'
                  ? t('connections.table.switchToTable')
                  : t('connections.table.switchToList')
              }
              isIconOnly
              size="sm"
              variant="light"
              onPress={async () => {
                const newMode = viewMode === 'list' ? 'table' : 'list'
                setViewMode(newMode)
                await patchAppConfig({ connectionViewMode: newMode })
              }}
            >
              {viewMode === 'list' ? (
                <MdTableChart className="text-lg" />
              ) : (
                <MdViewList className="text-lg" />
              )}
            </Button>
            <Button
              className="app-nodrag ml-1"
              title={isPaused ? t('connections.resume') : t('connections.pause')}
              isIconOnly
              size="sm"
              variant="light"
              onPress={togglePause}
            >
              {isPaused ? <IoMdPlay className="text-lg" /> : <IoMdPause className="text-lg" />}
            </Button>
            <Button
              className="app-nodrag ml-1"
              title={t('connections.closeAll')}
              isIconOnly
              size="sm"
              variant="light"
              onPress={() => {
                if (filter === '') {
                  closeAllConnections()
                } else {
                  filteredConnections.forEach((conn) => {
                    closeConnection(conn.id)
                  })
                }
              }}
            >
              {tab === 'active' ? <CgClose className="text-lg" /> : <CgTrash className="text-lg" />}
            </Button>
          </Badge>
        </div>
      }
    >
      {isDetailModalOpen && selectedConnection && (
        <ConnectionDetailModal
          onClose={() => setIsDetailModalOpen(false)}
          connection={selectedConnection}
        />
      )}
      <div className="overflow-x-auto sticky top-0 z-40">
        <div className="flex p-2 gap-2">
          <Tabs
            size="sm"
            color={tab === 'active' ? 'primary' : 'danger'}
            selectedKey={tab}
            variant="underlined"
            className="w-fit h-[32px]"
            onSelectionChange={(key: Key) => {
              setTab(key as string)
            }}
          >
            <Tab
              key="active"
              title={
                <Badge
                  color={tab === 'active' ? 'primary' : 'default'}
                  size="sm"
                  shape="circle"
                  variant="flat"
                  content={activeConnections.length}
                  showOutline={false}
                >
                  <span className="p-1">{t('connections.active')}</span>
                </Badge>
              }
            />
            <Tab
              key="closed"
              title={
                <Badge
                  color={tab === 'closed' ? 'danger' : 'default'}
                  size="sm"
                  shape="circle"
                  variant="flat"
                  content={closedConnections.length}
                  showOutline={false}
                >
                  <span className="p-1">{t('connections.closed')}</span>
                </Badge>
              }
            />
          </Tabs>
          <Input
            variant="flat"
            size="sm"
            value={filter}
            placeholder={t('connections.filter')}
            isClearable
            onValueChange={setFilter}
          />

          {viewMode === 'table' && (
            <Dropdown>
              <DropdownTrigger>
                <Button
                  size="sm"
                  variant="flat"
                  startContent={<HiOutlineAdjustmentsHorizontal className="text-2xl" />}
                >
                  {t('connections.table.columns')}
                </Button>
              </DropdownTrigger>
              <DropdownMenu
                aria-label="Column visibility"
                closeOnSelect={false}
                selectionMode="multiple"
                selectedKeys={visibleColumns}
                onSelectionChange={async (keys) => {
                  const newColumns = Array.from(keys) as string[]
                  setVisibleColumns(new Set(newColumns))
                  await patchAppConfig({ connectionTableColumns: newColumns })
                }}
              >
                <DropdownItem key="status">{t('connections.detail.status')}</DropdownItem>
                <DropdownItem key="establishTime">
                  {t('connections.detail.establishTime')}
                </DropdownItem>
                <DropdownItem key="type">{t('connections.detail.connectionType')}</DropdownItem>
                <DropdownItem key="host">{t('connections.detail.host')}</DropdownItem>
                <DropdownItem key="sniffHost">{t('connections.detail.sniffHost')}</DropdownItem>
                <DropdownItem key="process">{t('connections.detail.processName')}</DropdownItem>
                <DropdownItem key="processPath">{t('connections.detail.processPath')}</DropdownItem>
                <DropdownItem key="rule">{t('connections.detail.rule')}</DropdownItem>
                <DropdownItem key="proxyChain">{t('connections.detail.proxyChain')}</DropdownItem>
                <DropdownItem key="sourceIP">{t('connections.detail.sourceIP')}</DropdownItem>
                <DropdownItem key="sourcePort">{t('connections.detail.sourcePort')}</DropdownItem>
                <DropdownItem key="destinationPort">
                  {t('connections.detail.destinationPort')}
                </DropdownItem>
                <DropdownItem key="inboundIP">{t('connections.detail.inboundIP')}</DropdownItem>
                <DropdownItem key="inboundPort">{t('connections.detail.inboundPort')}</DropdownItem>
                <DropdownItem key="uploadSpeed">{t('connections.uploadSpeed')}</DropdownItem>
                <DropdownItem key="downloadSpeed">{t('connections.downloadSpeed')}</DropdownItem>
                <DropdownItem key="upload">{t('connections.uploadAmount')}</DropdownItem>
                <DropdownItem key="download">{t('connections.downloadAmount')}</DropdownItem>
                <DropdownItem key="dscp">{t('connections.detail.dscp')}</DropdownItem>
                <DropdownItem key="remoteDestination">
                  {t('connections.detail.remoteDestination')}
                </DropdownItem>
                <DropdownItem key="dnsMode">{t('connections.detail.dnsMode')}</DropdownItem>
              </DropdownMenu>
            </Dropdown>
          )}

          {viewMode === 'list' && (
            <>
              <Select
                classNames={{ trigger: 'data-[hover=true]:bg-default-200' }}
                size="sm"
                className="w-[180px] min-w-[131px]"
                aria-label={t('connections.orderBy')}
                selectedKeys={[connectionOrderBy]}
                disallowEmptySelection={true}
                onSelectionChange={async (v) => {
                  await patchAppConfig({
                    connectionOrderBy: v.currentKey as
                      | 'time'
                      | 'upload'
                      | 'download'
                      | 'uploadSpeed'
                      | 'downloadSpeed'
                  })
                }}
              >
                <SelectItem key="time">{t('connections.time')}</SelectItem>
                <SelectItem key="upload">{t('connections.uploadAmount')}</SelectItem>
                <SelectItem key="download">{t('connections.downloadAmount')}</SelectItem>
                <SelectItem key="uploadSpeed">{t('connections.uploadSpeed')}</SelectItem>
                <SelectItem key="downloadSpeed">{t('connections.downloadSpeed')}</SelectItem>
              </Select>
              <Button
                size="sm"
                isIconOnly
                className="bg-content2"
                onPress={() => {
                  patchAppConfig({
                    connectionDirection: connectionDirection === 'asc' ? 'desc' : 'asc'
                  })
                }}
              >
                {connectionDirection === 'asc' ? (
                  <HiSortAscending className="text-lg" />
                ) : (
                  <HiSortDescending className="text-lg" />
                )}
              </Button>
            </>
          )}
        </div>
        <Divider />
      </div>
      <div className="h-[calc(100vh-100px)] mt-px">
        {viewMode === 'list' ? (
          <Virtuoso
            data={filteredConnections}
            itemContent={(i, connection) => (
              <ConnectionItem
                setSelected={setSelected}
                setIsDetailModalOpen={setIsDetailModalOpen}
                close={closeConnection}
                index={i}
                key={connection.id}
                info={connection}
              />
            )}
          />
        ) : (
          <ConnectionTable
            connections={filteredConnections}
            setSelected={setSelected}
            setIsDetailModalOpen={setIsDetailModalOpen}
            close={closeConnection}
            visibleColumns={visibleColumns}
            initialColumnWidths={connectionTableColumnWidths}
            initialSortColumn={connectionTableSortColumn}
            initialSortDirection={connectionTableSortDirection}
            onColumnWidthChange={handleColumnWidthChange}
            onSortChange={handleSortChange}
          />
        )}
      </div>
    </BasePage>
  )
}

export default Connections
