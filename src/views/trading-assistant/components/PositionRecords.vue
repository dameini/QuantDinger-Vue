<template>
  <div class="position-records strategy-tab-pane-inner" :class="{ 'theme-dark': isDark }">
    <a-alert
      v-if="showReconciliationBanner"
      :type="reconciliationAlertType"
      show-icon
      class="reconciliation-alert"
      :message="reconciliationTitle"
    >
      <template slot="description">
        <div>{{ reconciliationDescription }}</div>
        <ul v-if="reconciliationNotes.length" class="reconciliation-notes">
          <li v-for="(note, idx) in reconciliationNotes" :key="idx">{{ formatReconciliationNote(note) }}</li>
        </ul>
        <div v-if="sharedCredentialHint" class="shared-credential-hint">
          {{ $t('trading-assistant.positions.sharedCredentialHint') }}
        </div>
      </template>
    </a-alert>

    <div class="records-toolbar">
      <a-checkbox-group v-model="sourceFilter" class="source-filter">
        <a-checkbox value="local">{{ $t('trading-assistant.records.sourceLocal') }}</a-checkbox>
        <a-checkbox value="htx">{{ $t('trading-assistant.records.sourceHtx') }}</a-checkbox>
      </a-checkbox-group>
    </div>

    <div class="positions-section">
      <div v-if="isLiveMode" class="section-head">
        <span class="section-title">{{ $t('trading-assistant.positions.strategyLedger') }}</span>
        <a-tag color="blue">{{ $t('trading-assistant.positions.dataSourceStrategy') }}</a-tag>
      </div>

      <div v-if="filteredPositions.length === 0 && !loading" class="empty-state strategy-tab-empty">
        <a-empty :description="$t('trading-assistant.table.noPositions')" />
      </div>
      <a-table
        v-else
        :columns="columns"
        :data-source="filteredPositions"
        :loading="loading"
        :pagination="false"
        size="small"
        rowKey="id"
        :scroll="{ x: 860 }"
      >
        <template slot="symbol" slot-scope="text, record">
          <strong>{{ record.symbol || text }}</strong>
        </template>
        <template slot="side" slot-scope="text, record">
          <a-tag :color="(record.side || text) === 'long' ? 'green' : 'red'">
            {{ (record.side || text) === 'long' ? $t('trading-assistant.table.long') : $t('trading-assistant.table.short') }}
          </a-tag>
        </template>
        <template slot="entryPrice" slot-scope="text, record">
          <span v-if="hasValidPrice(record.entry_price || text)">
            ${{ parseFloat(record.entry_price || text).toFixed(4) }}
          </span>
          <span v-else>--</span>
        </template>
        <template slot="currentPrice" slot-scope="text, record">
          ${{ parseFloat(record.current_price || text || 0).toFixed(4) }}
        </template>
        <template slot="size" slot-scope="text, record">
          {{ parseFloat(record.size || text || 0).toFixed(4) }}
        </template>
        <template slot="notional" slot-scope="text, record">
          <span v-if="getNotional(record) > 0">${{ getNotional(record).toFixed(2) }}</span>
          <span v-else>--</span>
        </template>
        <template slot="unrealizedPnl" slot-scope="text, record">
          <span :class="{ 'profit': parseFloat(record.unrealized_pnl || text || 0) > 0, 'loss': parseFloat(record.unrealized_pnl || text || 0) < 0 }">
            ${{ parseFloat(record.unrealized_pnl || text || 0).toFixed(2) }}
          </span>
        </template>
        <template slot="pnlPercent" slot-scope="text, record">
          <span :class="{ 'profit': parseFloat(record.pnl_percent || text || 0) > 0, 'loss': parseFloat(record.pnl_percent || text || 0) < 0 }">
            {{ parseFloat(record.pnl_percent || text || 0).toFixed(2) }}%
          </span>
        </template>
        <template slot="source" slot-scope="text, record">
          <a-tag :class="['source-tag', sourceClass(record)]">
            {{ sourceText(record) }}
          </a-tag>
        </template>
      </a-table>
    </div>

    <div v-if="isLiveMode" class="positions-section account-legs-section">
      <div class="section-head">
        <span class="section-title">{{ $t('trading-assistant.positions.accountMirror') }}</span>
        <a-tag color="purple">{{ $t('trading-assistant.positions.dataSourceAccount') }}</a-tag>
      </div>
      <div v-if="accountLegs.length === 0 && !loading" class="empty-state strategy-tab-empty account-empty">
        <a-empty :description="$t('trading-assistant.positions.noAccountPositions')" />
      </div>
      <a-table
        v-else
        :columns="accountColumns"
        :data-source="accountLegs"
        :loading="loading"
        :pagination="false"
        size="small"
        :rowKey="accountRowKey"
        :scroll="{ x: 640 }"
      >
        <template slot="symbol" slot-scope="text, record">
          <strong>{{ record.symbol || text }}</strong>
        </template>
        <template slot="side" slot-scope="text, record">
          <a-tag :color="(record.side || text) === 'long' ? 'green' : 'red'">
            {{ (record.side || text) === 'long' ? $t('trading-assistant.table.long') : $t('trading-assistant.table.short') }}
          </a-tag>
        </template>
        <template slot="size" slot-scope="text, record">
          {{ parseFloat(record.size || text || 0).toFixed(4) }}
        </template>
        <template slot="entryPrice" slot-scope="text, record">
          <span v-if="hasValidPrice(record.entry_price || text)">
            ${{ parseFloat(record.entry_price || text).toFixed(4) }}
          </span>
          <span v-else>--</span>
        </template>
        <template slot="syncedAt" slot-scope="text, record">
          {{ formatSyncedAt(record.synced_at || text) }}
        </template>
      </a-table>
    </div>
  </div>
</template>

<script>
import { getStrategyPositions } from '@/api/strategy'
import moment from 'moment'

export default {
  name: 'PositionRecords',
  props: {
    strategyId: {
      type: Number,
      required: true
    },
    executionMode: {
      type: String,
      default: 'signal'
    },
    marketType: {
      type: String,
      default: 'swap'
    },
    leverage: {
      type: [Number, String],
      default: 1
    },
    credentialId: {
      type: Number,
      default: 0
    },
    loading: {
      type: Boolean,
      default: false
    },
    isDark: {
      type: Boolean,
      default: false
    }
  },
  data () {
    return {
      positions: [],
      accountLegs: [],
      reconciliationStatus: { status: 'skipped', notes: [] },
      sourceFilter: ['local', 'htx'],
      lastExchangeSyncAt: 0,
      pollingTimer: null
    }
  },
  computed: {
    isLiveMode () {
      return String(this.executionMode || '').trim().toLowerCase() === 'live'
    },
    filteredPositions () {
      const selected = this.sourceFilter && this.sourceFilter.length ? this.sourceFilter : ['local', 'htx']
      return this.positions.filter(item => selected.includes(this.recordSourceKey(item)))
    },
    reconciliationNotes () {
      const notes = this.reconciliationStatus && this.reconciliationStatus.notes
      return Array.isArray(notes) ? notes : []
    },
    showReconciliationBanner () {
      if (!this.isLiveMode) return false
      const status = String((this.reconciliationStatus && this.reconciliationStatus.status) || 'skipped')
      return status !== 'skipped' && status !== 'ok'
    },
    reconciliationAlertType () {
      const status = String((this.reconciliationStatus && this.reconciliationStatus.status) || '')
      if (status === 'mismatch' || status === 'strategy_only') return 'warning'
      if (status === 'account_only') return 'info'
      return 'success'
    },
    reconciliationTitle () {
      const status = String((this.reconciliationStatus && this.reconciliationStatus.status) || 'ok')
      const key = `trading-assistant.positions.reconciliation.${status}.title`
      const translated = this.$t(key)
      return translated !== key ? translated : this.$t('trading-assistant.positions.reconciliation.mismatch.title')
    },
    reconciliationDescription () {
      const status = String((this.reconciliationStatus && this.reconciliationStatus.status) || 'ok')
      const key = `trading-assistant.positions.reconciliation.${status}.desc`
      const translated = this.$t(key)
      return translated !== key ? translated : ''
    },
    sharedCredentialHint () {
      return this.isLiveMode && Number(this.credentialId || 0) > 0
    },
    columns () {
      return [
        { title: this.$t('trading-assistant.table.symbol'), dataIndex: 'symbol', key: 'symbol', width: 106, scopedSlots: { customRender: 'symbol' } },
        { title: this.$t('trading-assistant.table.side'), dataIndex: 'side', key: 'side', width: 72, scopedSlots: { customRender: 'side' } },
        { title: this.$t('trading-assistant.table.size'), dataIndex: 'size', key: 'size', width: 96, scopedSlots: { customRender: 'size' } },
        { title: this.$t('trading-assistant.table.notional') || 'Value (USDT)', dataIndex: 'notional', key: 'notional', width: 106, scopedSlots: { customRender: 'notional' } },
        { title: this.$t('trading-assistant.table.entryPrice'), dataIndex: 'entry_price', key: 'entry_price', width: 96, scopedSlots: { customRender: 'entryPrice' } },
        { title: this.$t('trading-assistant.table.currentPrice'), dataIndex: 'current_price', key: 'current_price', width: 96, scopedSlots: { customRender: 'currentPrice' } },
        { title: this.$t('trading-assistant.table.unrealizedPnl'), dataIndex: 'unrealized_pnl', key: 'unrealized_pnl', width: 102, scopedSlots: { customRender: 'unrealizedPnl' } },
        { title: this.$t('trading-assistant.table.pnlPercent'), dataIndex: 'pnl_percent', key: 'pnl_percent', width: 88, scopedSlots: { customRender: 'pnlPercent' } },
        { title: this.$t('trading-assistant.table.source'), dataIndex: 'source', key: 'source', width: 94, scopedSlots: { customRender: 'source' } }
      ]
    },
    accountColumns () {
      return [
        { title: this.$t('trading-assistant.table.symbol'), dataIndex: 'symbol', key: 'symbol', width: 120, scopedSlots: { customRender: 'symbol' } },
        { title: this.$t('trading-assistant.table.side'), dataIndex: 'side', key: 'side', width: 80, scopedSlots: { customRender: 'side' } },
        { title: this.$t('trading-assistant.table.size'), dataIndex: 'size', key: 'size', width: 120, scopedSlots: { customRender: 'size' } },
        { title: this.$t('trading-assistant.table.entryPrice'), dataIndex: 'entry_price', key: 'entry_price', width: 120, scopedSlots: { customRender: 'entryPrice' } },
        { title: this.$t('trading-assistant.positions.syncedAt'), dataIndex: 'synced_at', key: 'synced_at', width: 160, scopedSlots: { customRender: 'syncedAt' } }
      ]
    }
  },
  watch: {
    strategyId: {
      handler (val) {
        if (val) {
          this.lastExchangeSyncAt = 0
          this.loadPositions()
          this.startPolling()
        } else {
          this.stopPolling()
        }
      },
      immediate: true
    }
  },
  beforeDestroy () {
    this.stopPolling()
  },
  methods: {
    accountRowKey (record, index) {
      return record.id || `${record.inst_id || record.symbol}-${record.side}-${index}`
    },
    async loadPositions () {
      if (!this.strategyId) return

      try {
        const now = Date.now()
        const shouldSyncExchange = now - this.lastExchangeSyncAt > 30000
        if (shouldSyncExchange) this.lastExchangeSyncAt = now
        const res = await getStrategyPositions(this.strategyId, {
          include_exchange: 1,
          sync_exchange: shouldSyncExchange ? 1 : 0
        })
        if (res.code === 1) {
          const data = res.data || {}
          const rawPositions = [
            ...(data.positions || data.items || []),
            ...(data.exchange_positions || [])
          ]
          this.accountLegs = data.account_legs || []
          this.reconciliationStatus = data.reconciliation_status || { status: 'skipped', notes: [] }

          this.positions = rawPositions.map((position, index) => {
            const mt = String(this.marketType || 'swap').toLowerCase()
            let lev = parseFloat(this.leverage)
            if (!isFinite(lev) || lev <= 0) lev = 1
            if (mt === 'spot') lev = 1

            const entryPrice = parseFloat(position.entry_price || position.entryPrice || 0)
            const size = parseFloat(position.size || '0') || 0
            const pnl = parseFloat(position.unrealized_pnl || position.unrealizedPnl || '0') || 0
            let pnlPercent = parseFloat(position.pnl_percent || position.pnlPercent || '0') || 0

            if (entryPrice > 0 && size > 0) {
              pnlPercent = (pnl / (entryPrice * size)) * 100 * lev
            } else if (mt !== 'spot') {
              pnlPercent = pnlPercent * lev
            }

            return {
              id: position.id || `${position.source || 'local'}-${index}`,
              symbol: position.symbol || '',
              side: position.side || 'long',
              size: size > 0 ? size.toString() : '0',
              entry_price: entryPrice > 0 ? entryPrice.toString() : '0',
              current_price: position.current_price || position.currentPrice || '0',
              unrealized_pnl: position.unrealized_pnl || position.unrealizedPnl || '0',
              pnl_percent: pnlPercent,
              updated_at: position.updated_at || position.updatedAt || '',
              source: position.source || 'local',
              attribution_status: position.attribution_status || 'strategy'
            }
          })
        } else {
          this.positions = []
          this.accountLegs = []
          this.reconciliationStatus = { status: 'skipped', notes: [] }
        }
      } catch (error) {
        this.positions = []
        this.accountLegs = []
        this.reconciliationStatus = { status: 'skipped', notes: [] }
      }
    },
    formatReconciliationNote (note) {
      const raw = String(note || '')
      const parts = raw.split(':')
      const kind = parts[0] || ''
      const sym = parts[1] || ''
      const side = parts[2] || ''
      const sideLabel = side === 'long'
        ? this.$t('trading-assistant.table.long')
        : side === 'short'
          ? this.$t('trading-assistant.table.short')
          : side
      const prefixKey = `trading-assistant.positions.note.${kind}`
      const prefix = this.$t(prefixKey)
      const prefixText = prefix !== prefixKey ? prefix : kind
      const detail = parts.slice(3).join(':')
      return detail ? `${prefixText} · ${sym} ${sideLabel} (${detail})` : `${prefixText} · ${sym} ${sideLabel}`
    },
    formatSyncedAt (raw) {
      if (!raw) return '--'
      const m = moment(raw)
      return m.isValid() ? m.format('MM-DD HH:mm:ss') : String(raw)
    },
    hasValidPrice (price) {
      const value = parseFloat(price)
      return Number.isFinite(value) && value > 0
    },
    getNotional (record) {
      const size = parseFloat(record.size || 0)
      const cp = parseFloat(record.current_price || 0)
      if (size > 0 && cp > 0) return size * cp
      const ep = parseFloat(record.entry_price || 0)
      if (size > 0 && ep > 0) return size * ep
      return 0
    },
    recordSourceKey (record) {
      return record && record.source === 'htx' ? 'htx' : 'local'
    },
    sourceText (record) {
      return this.recordSourceKey(record) === 'htx'
        ? this.$t('trading-assistant.records.sourceHtx')
        : this.$t('trading-assistant.records.sourceLocal')
    },
    sourceClass (record) {
      return `source-${this.recordSourceKey(record)}`
    },
    startPolling () {
      this.stopPolling()
      this.pollingTimer = setInterval(() => {
        this.loadPositions()
      }, 5000)
    },
    stopPolling () {
      if (this.pollingTimer) {
        clearInterval(this.pollingTimer)
        this.pollingTimer = null
      }
    }
  }
}
</script>

<style lang="less" scoped>
@primary-color: #1890ff;
@success-color: #0ecb81;
@danger-color: #f6465d;

.position-records {
  width: 100%;
  min-height: 300px;
  padding: 0;

  .reconciliation-alert {
    margin-bottom: 12px;
  }

  .reconciliation-notes {
    margin: 8px 0 0;
    padding-left: 18px;
    font-size: 12px;
  }

  .shared-credential-hint {
    margin-top: 8px;
    font-size: 12px;
    color: rgba(0, 0, 0, 0.55);
  }

  .records-toolbar {
    display: flex;
    justify-content: flex-end;
    align-items: center;
    margin-bottom: 10px;
  }

  .source-filter {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-size: 12px;
  }

  .positions-section + .positions-section {
    margin-top: 16px;
  }

  .section-head {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 10px;
  }

  .section-title {
    font-size: 13px;
    font-weight: 600;
    color: #334155;
  }

  .account-empty {
    min-height: 120px;
  }

  .empty-state {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 220px;
    padding: 40px 16px;
    border-radius: 8px;
    background: #fafafa;
    border: 1px solid #f0f0f0;
  }

  &.theme-dark .empty-state {
    background: #141414;
    border-color: rgba(255, 255, 255, 0.08);
  }

  &.theme-dark .section-title {
    color: #d1d4dc;
  }

  &.theme-dark .shared-credential-hint {
    color: rgba(255, 255, 255, 0.55);
  }

  ::v-deep .ant-table {
    font-size: 13px;
    color: #333;
  }

  ::v-deep .ant-table-body {
    overflow-x: auto;
    scrollbar-width: thin;
    scrollbar-color: rgba(0, 0, 0, 0.2) transparent;
  }

  ::v-deep .ant-table-thead > tr > th {
    background: linear-gradient(180deg, #f8fafc 0%, #f1f5f9 100%);
    font-weight: 600;
    color: #475569;
    border-bottom: 2px solid #e2e8f0;
    padding: 8px 10px;
    font-size: 12px;
  }

  ::v-deep .ant-table-tbody > tr > td {
    padding: 8px 10px;
    color: #334155;
    border-bottom: 1px solid #f1f5f9;
  }

  ::v-deep .ant-tag {
    border-radius: 6px;
    padding: 2px 10px;
    font-weight: 600;
    font-size: 11px;
    border: none;

    &[color="green"] {
      background: linear-gradient(135deg, rgba(14, 203, 129, 0.15) 0%, rgba(14, 203, 129, 0.08) 100%);
      color: @success-color;
      border: 1px solid rgba(14, 203, 129, 0.3);
    }

    &[color="red"] {
      background: linear-gradient(135deg, rgba(246, 70, 93, 0.15) 0%, rgba(246, 70, 93, 0.08) 100%);
      color: @danger-color;
      border: 1px solid rgba(246, 70, 93, 0.3);
    }
  }

  ::v-deep .source-tag {
    border-radius: 999px;
    padding: 2px 8px;
    font-size: 11px;
    font-weight: 800;
    border: 1px solid transparent !important;
  }

  ::v-deep .source-local {
    background: #111827 !important;
    color: #ffffff !important;
    border-color: #111827 !important;
  }

  ::v-deep .source-htx {
    background: #0052cc !important;
    color: #ffffff !important;
    border-color: #003d99 !important;
  }

  &.theme-dark {
    ::v-deep .ant-table {
      background: #1c1c1c !important;
      color: #d1d4dc !important;
    }

    ::v-deep .ant-table-thead > tr > th {
      background: #2a2e39 !important;
      color: #d1d4dc !important;
      border-bottom-color: #363c4e !important;
    }

    ::v-deep .ant-table-tbody > tr > td {
      background: #1c1c1c !important;
      color: #d1d4dc !important;
      border-bottom-color: #363c4e !important;
    }
  }

  .profit {
    color: @success-color;
    font-weight: 700;
  }

  .loss {
    color: @danger-color;
    font-weight: 700;
  }
}
</style>
