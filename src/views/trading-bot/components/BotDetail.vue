<template>
  <div class="bot-detail" :class="{ 'theme-dark': isDark }" v-if="bot">
    <a-card :bordered="false" class="detail-header-card">
      <div class="detail-header">
        <div class="header-left">
          <div class="type-icon" :style="{ background: botGradient }">
            <a-icon :type="botIcon" />
          </div>
          <div class="header-info">
            <h3>{{ bot.strategy_name }}</h3>
            <div class="header-tags">
              <a-tag :color="bot.status === 'running' ? 'green' : bot.status === 'error' ? 'red' : 'default'">
                {{ statusText }}
              </a-tag>
              <a-tag v-if="bot.bot_type" color="purple">{{ botTypeName }}</a-tag>
              <a-tag v-if="bot.trading_config && bot.trading_config.symbol" color="blue">
                {{ bot.trading_config.symbol }}
              </a-tag>
              <a-tag v-if="bot.exchange_config && bot.exchange_config.exchange_id">
                {{ exchangeName }}
              </a-tag>
            </div>
          </div>
        </div>
        <div class="header-actions">
          <a-button
            v-if="bot.status !== 'running'"
            type="primary"
            :loading="actionLoading"
            @click="$emit('start', bot)"
          >
            <a-icon type="play-circle" /> {{ $t('trading-bot.action.start') }}
          </a-button>
          <a-button
            v-else
            type="danger"
            :loading="actionLoading"
            @click="$emit('stop', bot)"
          >
            <a-icon type="pause-circle" /> {{ $t('trading-bot.action.stop') }}
          </a-button>
          <a-button
            @click="$emit('edit', bot)"
            :disabled="bot.status === 'running'"
          >
            <a-icon type="edit" /> {{ $t('trading-bot.action.edit') }}
          </a-button>
          <!--
            "Clone as code" escape hatch. The button is hidden unless the bot
            already has a Python `strategy_code` saved (it always should, but
            we guard against legacy rows). The actual cloning is owned by the
            parent (trading-bot/index.vue) so we just emit and let it decide
            how to confirm + call the API + handle the success toast.
          -->
          <a-tooltip
            v-if="bot && bot.strategy_code"
            :title="$t('trading-bot.cloneAsScript.tooltip')"
          >
            <a-button
              icon="code-sandbox"
              @click="$emit('clone-as-script', bot)"
            >
              {{ $t('trading-bot.action.cloneAsScript') }}
            </a-button>
          </a-tooltip>
          <a-button
            type="danger"
            ghost
            @click="$emit('delete', bot)"
            :disabled="bot.status === 'running'"
          >
            <a-icon type="delete" />
          </a-button>
          <a-button @click="$emit('close')">
            <a-icon type="close" />
          </a-button>
        </div>
      </div>
    </a-card>

    <a-card
      v-if="isGridLikeBot"
      :bordered="false"
      class="hedge-summary-card"
      style="margin-top: 12px;"
    >
      <div class="hedge-summary">
        <div class="hedge-summary__title">
          <a-icon type="thunderbolt" />
          <span>{{ $t('trading-bot.detail.hedgeSummary') }}</span>
          <a-tooltip :title="$t('trading-bot.detail.hedgeSummaryHint')">
            <a-icon type="question-circle" class="hedge-summary__tip" />
          </a-tooltip>
          <a-button size="small" type="link" @click="refreshHedgeSummary" :loading="hedgeLoading">
            <a-icon type="reload" />
          </a-button>
        </div>
        <div class="hedge-summary__grid">
          <div class="hedge-cell hedge-cell--long">
            <div class="hedge-cell__label">{{ $t('trading-bot.detail.longLeg') }}</div>
            <div class="hedge-cell__size">{{ formatLegSize(longLeg) }}</div>
            <div class="hedge-cell__sub">
              {{ $t('trading-assistant.table.entryPrice') }}: {{ formatPrice(longLeg.entry_price) }}
              <span class="hedge-cell__pnl" :class="legPnlClass(longLeg)">
                {{ formatPnl(legPnl(longLeg)) }}
              </span>
            </div>
          </div>
          <div class="hedge-cell hedge-cell--short">
            <div class="hedge-cell__label">{{ $t('trading-bot.detail.shortLeg') }}</div>
            <div class="hedge-cell__size">{{ formatLegSize(shortLeg) }}</div>
            <div class="hedge-cell__sub">
              {{ $t('trading-assistant.table.entryPrice') }}: {{ formatPrice(shortLeg.entry_price) }}
              <span class="hedge-cell__pnl" :class="legPnlClass(shortLeg)">
                {{ formatPnl(legPnl(shortLeg)) }}
              </span>
            </div>
          </div>
          <div class="hedge-cell hedge-cell--grid">
            <div class="hedge-cell__label">{{ $t('trading-bot.detail.totalGridProfit') }}</div>
            <div class="hedge-cell__size">
              <span :class="totalGridProfit > 0 ? 'profit' : totalGridProfit < 0 ? 'loss' : ''">
                {{ formatPnl(totalGridProfit) }}
              </span>
            </div>
            <div class="hedge-cell__sub">
              {{ $t('trading-bot.detail.matchedPairs') }}: {{ matchedPairCount }}
              <span class="hedge-cell__sub-divider">·</span>
              {{ $t('trading-bot.detail.tickInterval') }}: {{ tickIntervalDisplay }}
            </div>
          </div>
        </div>
      </div>
    </a-card>

    <a-card :bordered="false" class="detail-tabs-card" style="margin-top: 12px;">
      <a-tabs v-model="activeTab" :animated="false">
        <!-- 参数 Tab -->
        <a-tab-pane key="params" :tab="$t('trading-bot.tab.params')">
          <div v-if="activeTab === 'params'" class="params-panel">
            <div class="params-section">
              <div class="params-section__title">
                <a-icon type="setting" />
                <span>{{ $t('trading-bot.detail.basicConfig') }}</span>
              </div>
              <div class="params-grid">
                <div class="param-item">
                  <span class="param-label">{{ $t('trading-bot.wizard.symbol') }}</span>
                  <span class="param-value">{{ tc.symbol || '-' }}</span>
                </div>
                <div class="param-item">
                  <span class="param-label">{{ $t('trading-bot.wizard.marketType') }}</span>
                  <span class="param-value">
                    <a-tag :color="tc.market_type === 'swap' ? 'orange' : 'cyan'" size="small">
                      {{ tc.market_type === 'swap' ? $t('trading-bot.wizard.futures') : $t('trading-bot.wizard.spot') }}
                    </a-tag>
                  </span>
                </div>
                <div class="param-item" v-if="needsTimeframe">
                  <span class="param-label">{{ $t('trading-bot.wizard.timeframe') }}</span>
                  <span class="param-value">{{ tc.timeframe || '-' }}</span>
                </div>
                <div class="param-item" v-if="tc.market_type === 'swap'">
                  <span class="param-label">{{ $t('trading-bot.wizard.leverage') }}</span>
                  <span class="param-value highlight">{{ tc.leverage || 1 }}x</span>
                </div>
                <div class="param-item">
                  <span class="param-label">{{ capitalLabel }}</span>
                  <span class="param-value highlight">{{ formatNum(tc.initial_capital) }} USDT</span>
                </div>
                <div class="param-item" v-if="tc.order_mode">
                  <span class="param-label">{{ $t('trading-bot.grid.orderType') }}</span>
                  <span class="param-value">
                    <a-tag :color="tc.order_mode === 'maker' ? 'green' : 'blue'" size="small">
                      {{ tc.order_mode === 'maker' ? $t('trading-bot.grid.limitOrder') : $t('trading-bot.grid.marketOrder') }}
                    </a-tag>
                  </span>
                </div>
              </div>
            </div>

            <div class="params-section" v-if="displayStrategyItems.length">
              <div class="params-section__title">
                <a-icon type="sliders" />
                <span>{{ $t('trading-bot.wizard.strategyParams') }}</span>
              </div>
              <div class="params-grid">
                <div class="param-item" v-for="item in displayStrategyItems" :key="item.key">
                  <span class="param-label">{{ item.label }}</span>
                  <span class="param-value" :class="{ highlight: isNumeric(item.value) }">{{ item.value }}</span>
                </div>
              </div>
            </div>

            <div class="params-section" v-if="displayRiskItems.length">
              <div class="params-section__title">
                <a-icon type="safety-certificate" />
                <span>{{ $t('trading-bot.wizard.riskParams') }}</span>
              </div>
              <div class="params-grid">
                <div class="param-item" v-for="item in displayRiskItems" :key="item.key">
                  <span class="param-label">{{ item.label }}</span>
                  <span class="param-value highlight" :class="riskValueClass(item.key)">{{ item.value }}</span>
                </div>
              </div>
            </div>
          </div>
        </a-tab-pane>

        <!-- 预估挂单 Tab (仅网格) -->
        <a-tab-pane v-if="isGridBot" key="gridPreview" :tab="$t('trading-bot.tab.gridPreview')">
          <div v-if="activeTab === 'gridPreview'" class="grid-preview-panel">
            <!-- 概览卡片 -->
            <div class="grid-overview">
              <div class="grid-overview__item">
                <span class="ov-label">{{ $t('trading-bot.grid.upperPrice') }}</span>
                <span class="ov-value">{{ formatPrice(gp.upperPrice) }}</span>
              </div>
              <div class="grid-overview__item">
                <span class="ov-label">{{ $t('trading-bot.grid.lowerPrice') }}</span>
                <span class="ov-value">{{ formatPrice(gp.lowerPrice) }}</span>
              </div>
              <div class="grid-overview__item">
                <span class="ov-label">{{ $t('trading-bot.grid.gridCount') }}</span>
                <span class="ov-value">{{ gp.gridCount }}</span>
              </div>
              <div class="grid-overview__item">
                <span class="ov-label">{{ $t('trading-bot.grid.amountPerGrid') }}</span>
                <span class="ov-value">{{ formatNum(gp.amountPerGrid) }} USDT</span>
              </div>
              <div class="grid-overview__item">
                <span class="ov-label">{{ $t('trading-bot.grid.gridSpacing') }}</span>
                <span class="ov-value">{{ gridSpacingDisplay }}</span>
              </div>
              <div class="grid-overview__item">
                <span class="ov-label">{{ $t('trading-bot.grid.totalInvest') }}</span>
                <span class="ov-value highlight">{{ formatNum(gp.amountPerGrid * gp.gridCount) }} USDT</span>
              </div>
              <div class="grid-overview__item">
                <span class="ov-label">{{ $t('trading-bot.detail.gridProfitPerGrid') }}</span>
                <span class="ov-value highlight">~{{ formatUsdt(avgGridProfitUsdt) }} USDT</span>
              </div>
              <div class="grid-overview__item">
                <span class="ov-label">{{ $t('trading-bot.detail.gridProfitPct') }}</span>
                <span class="ov-value highlight">{{ gridProfitPctDisplay }}</span>
              </div>
              <div
                v-if="gp.gridDirection !== 'neutral' && gp.initialPositionPct > 0"
                class="grid-overview__item"
              >
                <span class="ov-label">{{ $t('trading-bot.grid.initialPositionPct') }}</span>
                <span class="ov-value">{{ gp.initialPositionPct }}%</span>
              </div>
              <div v-if="gp.boundaryAction" class="grid-overview__item">
                <span class="ov-label">{{ $t('trading-bot.grid.boundaryAction') }}</span>
                <span class="ov-value">{{ formatParamValue('boundaryAction', gp.boundaryAction) }}</span>
              </div>
            </div>

            <div class="grid-note">
              <a-icon type="info-circle" />
              <span>{{ gridNoteText }}</span>
            </div>

            <!-- 左右两列：做多 | 做空 -->
            <div class="grid-orders-split">
              <div class="grid-orders-col grid-orders-col--long">
                <div class="grid-orders-col__header grid-orders-col__header--long">
                  <a-icon type="arrow-up" /> {{ $t('trading-bot.detail.gridLong') }}
                  <span class="grid-orders-col__count">{{ longOrders.length }}</span>
                </div>
                <div class="grid-orders-col__list">
                  <div
                    v-for="o in longOrders"
                    :key="'l-' + o.level"
                    class="grid-order-item grid-order-item--long"
                  >
                    <div class="grid-order-item__level">#{{ o.level }}</div>
                    <div class="grid-order-item__price">{{ formatPrice(o.price) }}</div>
                    <div class="grid-order-item__target" v-if="o.targetPrice">
                      → {{ formatPrice(o.targetPrice) }}
                    </div>
                    <div class="grid-order-item__profit" v-if="o.profitUsdt > 0">
                      +{{ formatUsdt(o.profitUsdt) }}
                    </div>
                  </div>
                  <div v-if="!longOrders.length" class="grid-orders-col__empty">-</div>
                </div>
              </div>

              <!-- 中间分隔（参考价格线） -->
              <div v-if="gp.gridDirection === 'neutral'" class="grid-orders-entry">
                <div class="grid-orders-entry__badge">
                  <a-icon type="aim" />
                </div>
                <div class="grid-orders-entry__price">{{ formatPrice(gridRefPrice) }}</div>
                <div class="grid-orders-entry__label">{{ entryOrder ? $t('trading-bot.detail.gridEntry') : $t('trading-bot.detail.gridRefPrice') }}</div>
              </div>

              <div class="grid-orders-col grid-orders-col--short">
                <div class="grid-orders-col__header grid-orders-col__header--short">
                  <a-icon type="arrow-down" /> {{ $t('trading-bot.detail.gridShort') }}
                  <span class="grid-orders-col__count">{{ shortOrders.length }}</span>
                </div>
                <div class="grid-orders-col__list">
                  <div
                    v-for="o in shortOrders"
                    :key="'s-' + o.level"
                    class="grid-order-item grid-order-item--short"
                  >
                    <div class="grid-order-item__level">#{{ o.level }}</div>
                    <div class="grid-order-item__price">{{ formatPrice(o.price) }}</div>
                    <div class="grid-order-item__target" v-if="o.targetPrice">
                      → {{ formatPrice(o.targetPrice) }}
                    </div>
                    <div class="grid-order-item__profit" v-if="o.profitUsdt > 0">
                      +{{ formatUsdt(o.profitUsdt) }}
                    </div>
                  </div>
                  <div v-if="!shortOrders.length" class="grid-orders-col__empty">-</div>
                </div>
              </div>
            </div>

            <!-- K线 + 网格可视化 -->
            <div class="grid-visual" v-if="gridPriceLevels.length > 0 && gridPriceLevels.length <= 60">
              <div class="grid-visual__title">
                <a-icon type="bar-chart" />
                <span>{{ $t('trading-bot.detail.gridVisual') }}</span>
                <span v-if="klineLoading" class="grid-visual__loading">
                  <a-icon type="loading" /> K线加载中...
                </span>
              </div>
              <div class="grid-visual__chart" ref="gridChartWrap">
                <canvas ref="klineCanvas" class="grid-kline-canvas"></canvas>
                <div
                  v-for="(lv, idx) in gridPriceLevels"
                  :key="'line-' + idx"
                  class="grid-line"
                  :class="{
                    'grid-line--buy': lv.side === 'long',
                    'grid-line--sell': lv.side === 'short',
                    'grid-line--mid': lv.side === 'entry'
                  }"
                  :style="{ bottom: lv.pct + '%' }"
                  :title="'#' + idx + ' ' + formatPrice(lv.price)"
                >
                  <div class="grid-line__bar"></div>
                  <div class="grid-line__price">{{ formatPrice(lv.price) }}</div>
                </div>
              </div>
            </div>
          </div>
        </a-tab-pane>

        <a-tab-pane
          v-if="isGridBot"
          key="restingOrders"
          :tab="$t('trading-bot.tab.gridRestingOrders')"
        >
          <div v-if="activeTab === 'restingOrders'" class="resting-orders-panel">
            <div class="resting-orders-toolbar">
              <a-button size="small" type="link" @click="refreshRestingOrders" :loading="restingLoading">
                <a-icon type="reload" />
              </a-button>
              <span v-if="bot.status !== 'running'" class="resting-orders-hint">
                {{ $t('trading-bot.detail.restingOrdersStopped') }}
              </span>
            </div>
            <a-table
              v-if="restingOrderRows.length"
              :columns="restingOrderColumns"
              :data-source="restingOrderRows"
              :pagination="false"
              size="small"
              row-key="id"
              :scroll="{ x: 720 }"
            />
            <a-empty v-else :description="$t('trading-bot.detail.restingOrdersEmpty')" />
          </div>
        </a-tab-pane>

        <a-tab-pane key="positions" :tab="$t('trading-bot.tab.positions')">
          <position-records
            v-if="activeTab === 'positions'"
            :strategy-id="bot.id"
            :execution-mode="(bot && bot.execution_mode) || 'live'"
            :market-type="tc.market_type || 'swap'"
            :leverage="tc.leverage || 1"
            :credential-id="botCredentialId"
            :is-dark="isDark"
          />
        </a-tab-pane>
        <a-tab-pane key="trades" :tab="$t('trading-bot.tab.trades')">
          <trading-records
            v-if="activeTab === 'trades'"
            :strategyId="bot.id"
            :isDark="isDark"
            :botType="bot && bot.bot_type"
          />
        </a-tab-pane>
        <a-tab-pane key="performance" :tab="$t('trading-bot.tab.performance')">
          <performance-analysis
            v-if="activeTab === 'performance'"
            :strategyId="bot.id"
            :isDark="isDark"
            :botType="bot && bot.bot_type"
          />
        </a-tab-pane>
        <a-tab-pane key="logs" :tab="$t('trading-bot.tab.logs')">
          <strategy-logs
            v-if="activeTab === 'logs'"
            :strategyId="bot.id"
            :isDark="isDark"
          />
        </a-tab-pane>
      </a-tabs>
    </a-card>
  </div>
</template>

<script>
import TradingRecords from '@/views/trading-assistant/components/TradingRecords.vue'
import PositionRecords from '@/views/trading-assistant/components/PositionRecords.vue'
import PerformanceAnalysis from '@/views/trading-assistant/components/PerformanceAnalysis.vue'
import StrategyLogs from '@/views/trading-assistant/components/StrategyLogs.vue'
import request from '@/utils/request'
import { getStrategyPositions, getStrategyTrades, getGridRestingOrders } from '@/api/strategy'

const TYPE_META = {
  grid: { icon: 'bar-chart', gradient: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' },
  martingale: { icon: 'fall', gradient: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)' },
  trend: { icon: 'stock', gradient: 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)' },
  dca: { icon: 'fund', gradient: 'linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)' },
  arbitrage: { icon: 'swap', gradient: 'linear-gradient(135deg, #fa709a 0%, #fee140 100%)' },
  custom: { icon: 'code', gradient: 'linear-gradient(135deg, #a18cd1 0%, #fbc2eb 100%)' }
}

const PARAM_LABEL_MAP = {
  upperPrice: 'trading-bot.grid.upperPrice',
  lowerPrice: 'trading-bot.grid.lowerPrice',
  gridCount: 'trading-bot.grid.gridCount',
  amountPerGrid: 'trading-bot.grid.amountPerGrid',
  gridMode: 'trading-bot.grid.mode',
  gridDirection: 'trading-bot.grid.direction',
  initialPositionPct: 'trading-bot.grid.initialPositionPct',
  boundaryAction: 'trading-bot.grid.boundaryAction',
  adaptiveBounds: 'trading-bot.grid.adaptiveBounds',
  adaptiveAtrMult: 'trading-bot.grid.adaptiveAtrMult',
  waterfallProtection: 'trading-bot.grid.waterfallProtection',
  waterfallDropPct: 'trading-bot.grid.waterfallDropPct',
  referencePrice: 'trading-bot.detail.gridRefPrice',
  orderMode: 'trading-bot.grid.orderType',
  initialAmount: 'trading-bot.martingale.initialAmount',
  multiplier: 'trading-bot.martingale.multiplier',
  maxLayers: 'trading-bot.martingale.maxLayers',
  priceDropPct: 'trading-bot.martingale.priceDropPct',
  takeProfitPct: 'trading-bot.martingale.takeProfitPct',
  stopLossPct: 'trading-bot.risk.stopLossPct',
  direction: 'trading-bot.martingale.direction',
  maPeriod: 'trading-bot.trend.maPeriod',
  maType: 'trading-bot.trend.maType',
  confirmBars: 'trading-bot.trend.confirmBars',
  positionPct: 'trading-bot.trend.positionPct',
  amountEach: 'trading-bot.dca.amountEach',
  frequency: 'trading-bot.dca.frequency',
  totalBudget: 'trading-bot.dca.totalBudget',
  dipBuyEnabled: 'trading-bot.dca.dipBuy',
  dipThreshold: 'trading-bot.dca.dipThreshold'
}

const VALUE_DISPLAY_MAP = {
  gridMode: { arithmetic: 'trading-bot.grid.arithmetic', geometric: 'trading-bot.grid.geometric' },
  gridDirection: { neutral: 'trading-bot.grid.neutral', long: 'trading-bot.grid.long', short: 'trading-bot.grid.short' },
  orderMode: { maker: 'trading-bot.grid.limitOrder', market: 'trading-bot.grid.marketOrder' },
  boundaryAction: {
    pause: 'trading-bot.grid.boundaryPause',
    stop_loss: 'trading-bot.grid.boundaryStopLoss',
    hold: 'trading-bot.grid.boundaryHold'
  }
}

export default {
  name: 'BotDetail',
  components: { TradingRecords, PositionRecords, PerformanceAnalysis, StrategyLogs },
  props: {
    bot: { type: Object, default: null },
    isDark: { type: Boolean, default: false },
    actionLoading: { type: Boolean, default: false }
  },
  data () {
    return {
      activeTab: 'params',
      klineData: [],
      klineLoading: false,
      // Hedge summary for grid/DCA bots (P0-1 / P1-1 surfacing).
      hedgePositions: [],
      hedgeTrades: [],
      hedgeLoading: false,
      hedgeTimer: null,
      restingOrders: [],
      restingLoading: false,
      restingTimer: null
    }
  },
  computed: {
    restingOrderColumns () {
      const t = (k) => this.$t(k)
      return [
        { title: t('trading-bot.detail.restingOrderCell'), dataIndex: 'cell_index', width: 64 },
        { title: t('trading-bot.detail.restingOrderPurpose'), dataIndex: 'purposeLabel' },
        { title: t('trading-bot.detail.restingOrderSide'), dataIndex: 'side', width: 72 },
        { title: t('trading-bot.detail.restingOrderPrice'), dataIndex: 'priceLabel' },
        { title: t('trading-bot.detail.restingOrderQty'), dataIndex: 'qtyLabel' },
        { title: t('trading-bot.detail.restingOrderFilled'), dataIndex: 'filledLabel' },
        { title: t('trading-bot.detail.restingOrderStatus'), dataIndex: 'statusLabel' },
        { title: t('trading-bot.detail.restingOrderExchangeId'), dataIndex: 'exchange_order_id', ellipsis: true }
      ]
    },
    restingOrderRows () {
      return (this.restingOrders || []).map(o => ({
        ...o,
        purposeLabel: this.formatRestingPurpose(o.purpose),
        priceLabel: this.formatPrice(o.price),
        qtyLabel: this.formatLegSize({ size: o.quantity }),
        filledLabel: this.formatLegSize({ size: o.filled_quantity }),
        statusLabel: this.formatRestingStatus(o.status)
      }))
    },
    tc () { return this.bot?.trading_config || {} },
    botCredentialId () {
      const cfg = this.bot?.exchange_config
      if (!cfg || typeof cfg !== 'object') return 0
      const raw = cfg.credential_id || cfg.credentials_id
      const n = parseInt(raw, 10)
      return Number.isFinite(n) && n > 0 ? n : 0
    },
    botParams () { return this.tc.bot_params || {} },
    botDisplay () { return this.bot?.bot_display || {} },
    isMartingaleBot () { return (this.bot?.bot_type || this.tc.bot_type) === 'martingale' },
    needsTimeframe () { return (this.bot?.bot_type || this.tc.bot_type) === 'trend' },
    displayStrategyItems () {
      const items = Array.isArray(this.botDisplay?.strategy_params) ? this.botDisplay.strategy_params : null
      if (items && items.length) {
        return items.map(item => ({
          key: item.key,
          label: item.label_key ? this.$t(item.label_key) : this.paramLabel(item.key),
          value: this.formatDisplayItem(item)
        }))
      }
      return Object.entries(this.displayBotParams).map(([key, val]) => ({
        key,
        label: this.paramLabel(key),
        value: this.formatParamValue(key, val)
      }))
    },
    displayBotParams () {
      const skip = new Set(['orderMode', 'timeframe', 'gridExecutionMode', 'grid_execution_mode'])
      const trailingOn = this.botParams && this.botParams.trailingTpEnabled === true
      const out = {}
      for (const [k, v] of Object.entries(this.botParams)) {
        if (skip.has(k)) continue
        if (v === null || v === undefined || v === '') continue
        // Hide the activation / callback % rows when trailing TP is OFF —
        // they're noise for users who didn't enable the feature.
        if (!trailingOn && (k === 'trailingTpActivationPct' || k === 'trailingTpCallbackPct')) continue
        out[k] = v
      }
      return out
    },
    capitalLabel () {
      return this.botDisplay?.capital_label_key
        ? this.$t(this.botDisplay.capital_label_key)
        : this.$t('trading-bot.wizard.initialCapital')
    },
    displayRiskItems () {
      const items = Array.isArray(this.botDisplay?.risk_params) ? this.botDisplay.risk_params : null
      if (items && items.length) {
        return items.map(item => ({
          key: item.key,
          label: item.label_key ? this.$t(item.label_key) : this.paramLabel(item.key),
          value: this.formatDisplayItem(item)
        }))
      }
      const fallback = []
      if (!this.isMartingaleBot && this.tc.stop_loss_pct) fallback.push({ key: 'stopLossPct', label: this.$t('trading-bot.risk.stopLossPct'), value: `${this.tc.stop_loss_pct}%` })
      if (!this.isMartingaleBot && this.tc.take_profit_pct) fallback.push({ key: 'takeProfitPct', label: this.$t('trading-bot.risk.takeProfitPct'), value: `${this.tc.take_profit_pct}%` })
      if (!this.isMartingaleBot && this.tc.max_position) fallback.push({ key: 'maxPosition', label: this.$t('trading-bot.risk.maxPosition'), value: `${this.formatNum(this.tc.max_position)} USDT` })
      if (this.tc.max_daily_loss) fallback.push({ key: 'maxDailyLoss', label: this.isMartingaleBot ? this.$t('trading-bot.martingale.maxDailyLossAdvanced') : this.$t('trading-bot.risk.maxDailyLoss'), value: `${this.formatNum(this.tc.max_daily_loss)} USDT` })
      return fallback
    },
    isGridBot () { return (this.bot?.bot_type || this.tc.bot_type) === 'grid' },
    isGridLikeBot () {
      const bt = this.bot?.bot_type || this.tc.bot_type
      return bt === 'grid' || bt === 'dca'
    },
    longLeg () {
      const sym = String((this.tc.symbol || '').split(':')[0] || '').toUpperCase()
      return this.hedgePositions.find(p => {
        const s = String(p.side || '').toLowerCase()
        const ok = String((p.symbol || '').split(':')[0] || '').toUpperCase() === sym
        return s === 'long' && ok
      }) || { side: 'long', size: 0, entry_price: 0, current_price: 0 }
    },
    shortLeg () {
      const sym = String((this.tc.symbol || '').split(':')[0] || '').toUpperCase()
      return this.hedgePositions.find(p => {
        const s = String(p.side || '').toLowerCase()
        const ok = String((p.symbol || '').split(':')[0] || '').toUpperCase() === sym
        return s === 'short' && ok
      }) || { side: 'short', size: 0, entry_price: 0, current_price: 0 }
    },
    // FIFO matched-grid profit comes pre-computed from the backend
    // (P1-1 — grid_matched_profit on qd_strategy_trades). We just sum the
    // realised legs and count rows that have a non-zero matched_entry_price.
    totalGridProfit () {
      let sum = 0
      for (const t of this.hedgeTrades) {
        const v = parseFloat(t.grid_matched_profit || 0)
        if (!isNaN(v)) sum += v
      }
      return sum
    },
    matchedPairCount () {
      let n = 0
      for (const t of this.hedgeTrades) {
        const matched = parseFloat(t.matched_entry_price || 0)
        if (matched > 0) n += 1
      }
      return n
    },
    tickIntervalDisplay () {
      const tc = this.tc || {}
      const override = tc.tick_interval_sec
      if (override != null && override !== '') return `${override}s`
      // Backend default: 1s for grid/dca, 10s otherwise (see trading_executor.py).
      return this.isGridLikeBot ? '1s' : '10s'
    },
    gp () {
      const bp = this.botParams
      return {
        upperPrice: parseFloat(bp.upperPrice) || 0,
        lowerPrice: parseFloat(bp.lowerPrice) || 0,
        gridCount: parseInt(bp.gridCount) || 10,
        amountPerGrid: parseFloat(bp.amountPerGrid) || 0,
        gridMode: bp.gridMode || 'arithmetic',
        gridDirection: bp.gridDirection || 'long',
        initialPositionPct: parseFloat(bp.initialPositionPct) || 0,
        boundaryAction: bp.boundaryAction || 'pause'
      }
    },
    gridNoteText () {
      const base = this.$t('trading-bot.detail.gridNote')
      const extraMap = {
        long: 'trading-bot.detail.gridNoteLong',
        short: 'trading-bot.detail.gridNoteShort',
        neutral: 'trading-bot.detail.gridNoteNeutral'
      }
      const extraKey = extraMap[this.gp.gridDirection]
      return extraKey ? `${base} ${this.$t(extraKey)}` : base
    },
    gridLevelPrices () {
      const { upperPrice, lowerPrice, gridCount, gridMode } = this.gp
      if (!upperPrice || !lowerPrice || !gridCount || upperPrice <= lowerPrice) return []
      const n = Math.max(2, gridCount)
      const levels = []
      if (gridMode === 'geometric' && lowerPrice > 0) {
        const r = Math.pow(upperPrice / lowerPrice, 1.0 / (n - 1))
        for (let i = 0; i < n; i++) levels.push(lowerPrice * Math.pow(r, i))
      } else {
        const step = (upperPrice - lowerPrice) / (n - 1)
        for (let i = 0; i < n; i++) levels.push(lowerPrice + step * i)
      }
      return levels
    },
    gridCells () {
      const levels = this.gridLevelPrices
      const cells = []
      for (let i = 0; i < levels.length - 1; i++) {
        cells.push({ index: i, lower: levels[i], upper: levels[i + 1] })
      }
      return cells
    },
    gridSpacingDisplay () {
      const { upperPrice, lowerPrice, gridCount, gridMode } = this.gp
      if (!upperPrice || !lowerPrice || !gridCount) return '-'
      const n = Math.max(2, gridCount)
      if (gridMode === 'geometric' && lowerPrice > 0) {
        const ratio = Math.pow(upperPrice / lowerPrice, 1.0 / (n - 1))
        return ((ratio - 1) * 100).toFixed(2) + '%'
      }
      return this.formatPrice((upperPrice - lowerPrice) / (n - 1))
    },
    gridRefPrice () {
      const fixed = parseFloat(this.botParams.referencePrice)
      if (fixed > 0) return fixed
      const state = (this.tc.script_runtime_state || {}).params || {}
      if (state.prev_price && state.prev_price > 0) return state.prev_price
      const { upperPrice, lowerPrice } = this.gp
      return (upperPrice + lowerPrice) / 2
    },
    gridPriceLevels () {
      const { upperPrice, lowerPrice, gridDirection } = this.gp
      const levels = this.gridLevelPrices
      if (!levels.length || !upperPrice || !lowerPrice || upperPrice <= lowerPrice) return []
      const ref = this.gridRefPrice
      return levels.map(price => {
        let side = ''
        if (gridDirection === 'long') side = 'long'
        else if (gridDirection === 'short') side = 'short'
        else side = price < ref ? 'long' : price > ref ? 'short' : 'entry'
        return { price, pct: ((price - lowerPrice) / (upperPrice - lowerPrice)) * 100, side }
      })
    },
    gridOrders () {
      const cells = this.gridCells
      const { amountPerGrid, gridDirection } = this.gp
      if (!cells.length) return []
      const ref = this.gridRefPrice
      const orders = []
      for (const cell of cells) {
        if (gridDirection === 'long') {
          if (cell.lower >= ref) continue
          const targetPrice = cell.upper
          const profitUsdt = amountPerGrid * ((targetPrice - cell.lower) / cell.lower)
          orders.push({
            level: cell.index,
            price: cell.lower,
            side: 'long',
            trigger: this.$t('trading-bot.detail.triggerDrop'),
            targetPrice,
            profitUsdt
          })
        } else if (gridDirection === 'short') {
          if (cell.upper <= ref) continue
          const targetPrice = cell.lower
          const profitUsdt = amountPerGrid * ((cell.upper - targetPrice) / targetPrice)
          orders.push({
            level: cell.index,
            price: cell.upper,
            side: 'short',
            trigger: this.$t('trading-bot.detail.triggerRise'),
            targetPrice,
            profitUsdt
          })
        } else {
          if (cell.lower < ref) {
            const targetPrice = cell.upper
            const profitUsdt = amountPerGrid * ((targetPrice - cell.lower) / cell.lower)
            orders.push({
              level: cell.index,
              price: cell.lower,
              side: 'long',
              trigger: this.$t('trading-bot.detail.triggerDrop'),
              targetPrice,
              profitUsdt
            })
          }
          if (cell.upper > ref) {
            const targetPrice = cell.lower
            const profitUsdt = amountPerGrid * ((cell.upper - targetPrice) / targetPrice)
            orders.push({
              level: cell.index + 0.5,
              price: cell.upper,
              side: 'short',
              trigger: this.$t('trading-bot.detail.triggerRise'),
              targetPrice,
              profitUsdt
            })
          }
        }
      }
      return orders
    },
    longOrders () { return this.gridOrders.filter(o => o.side === 'long').sort((a, b) => b.price - a.price) },
    shortOrders () { return this.gridOrders.filter(o => o.side === 'short').sort((a, b) => a.price - b.price) },
    entryOrder () { return this.gridOrders.find(o => o.side === 'entry') || null },
    avgGridProfitUsdt () {
      const orders = this.gridOrders.filter(o => o.profitUsdt > 0)
      if (!orders.length) return 0
      return orders.reduce((s, o) => s + o.profitUsdt, 0) / orders.length
    },
    gridProfitPctDisplay () {
      const amountPerGrid = parseFloat(this.gp.amountPerGrid) || 0
      const orders = this.gridOrders.filter(o => o.profitUsdt > 0)
      if (!amountPerGrid || !orders.length) return '-'
      const avgPct = orders.reduce((sum, o) => sum + (o.profitUsdt / amountPerGrid) * 100, 0) / orders.length
      return `${avgPct.toFixed(2)}%`
    },
    botIcon () { return (TYPE_META[this.bot?.bot_type] || TYPE_META.custom).icon },
    botGradient () { return (TYPE_META[this.bot?.bot_type] || TYPE_META.custom).gradient },
    botTypeName () { return this.$t(`trading-bot.type.${this.bot?.bot_type}`) || this.bot?.bot_type },
    statusText () {
      const map = { running: this.$t('trading-bot.status.running'), stopped: this.$t('trading-bot.status.stopped'), error: this.$t('trading-bot.status.error') }
      return map[this.bot?.status] || this.$t('trading-bot.status.stopped')
    },
    exchangeName () {
      const id = this.bot?.exchange_config?.exchange_id
      return { binance: 'Binance', bybit: 'Bybit', gate: 'Gate.io', okx: 'OKX', htx: 'HTX' }[id] || id
    }
  },
  watch: {
    'bot.id': {
      immediate: true,
      handler (id) {
        this.stopHedgePolling()
        this.stopRestingPolling()
        if (id && this.isGridLikeBot) {
          this.refreshHedgeSummary()
          this.startHedgePolling()
        }
        if (id && this.isGridBot) {
          this.refreshRestingOrders(true)
        }
      }
    },
    activeTab (tab) {
      if (tab === 'restingOrders' && this.isGridBot) {
        this.refreshRestingOrders()
        this.startRestingPolling()
      } else {
        this.stopRestingPolling()
      }
      if (tab === 'gridPreview' && this.isGridBot && !this.klineData.length) {
        this.$nextTick(() => this.fetchKlineForGrid())
      }
      if (tab === 'gridPreview' && this.klineData.length) {
        setTimeout(() => this.drawKlineBackground(), 200)
      }
    },
    isGridLikeBot: {
      handler (val) {
        this.stopHedgePolling()
        if (val && this.bot?.id) {
          this.refreshHedgeSummary()
          this.startHedgePolling()
        }
      }
    },
    bot () {
      this.activeTab = 'params'
      this.klineData = []
    },
    klineData () {
      setTimeout(() => this.drawKlineBackground(), 300)
    }
  },
  beforeDestroy () {
    this.stopHedgePolling()
    this.stopRestingPolling()
  },
  methods: {
    startRestingPolling () {
      this.stopRestingPolling()
      if (!this.isGridBot) return
      this.restingTimer = setInterval(() => {
        if (this.activeTab === 'restingOrders') this.refreshRestingOrders(true)
      }, 5000)
    },
    stopRestingPolling () {
      if (this.restingTimer) {
        clearInterval(this.restingTimer)
        this.restingTimer = null
      }
    },
    async refreshRestingOrders (silent = false) {
      if (!this.bot?.id || !this.isGridBot) return
      if (!silent) this.restingLoading = true
      try {
        const res = await getGridRestingOrders(this.bot.id, { limit: 200, sync: true })
        if (res && res.code === 1) {
          this.restingOrders = (res.data && (res.data.orders || res.data.items)) || []
        }
      } finally {
        this.restingLoading = false
      }
    },
    formatRestingPurpose (purpose) {
      const key = `trading-bot.detail.restingPurpose.${purpose}`
      const t = this.$t(key)
      return t !== key ? t : String(purpose || '-')
    },
    formatRestingStatus (status) {
      const key = `trading-bot.detail.restingStatus.${status}`
      const t = this.$t(key)
      return t !== key ? t : String(status || '-')
    },
    startHedgePolling () {
      this.stopHedgePolling()
      // 15s cadence is plenty — the summary card is informational, not
      // execution-critical, and the row data is refreshed cheaply via
      // existing list endpoints.
      this.hedgeTimer = setInterval(() => {
        this.refreshHedgeSummary(true)
      }, 15000)
    },
    stopHedgePolling () {
      if (this.hedgeTimer) {
        clearInterval(this.hedgeTimer)
        this.hedgeTimer = null
      }
    },
    async refreshHedgeSummary (silent = false) {
      if (!this.bot?.id) return
      if (!silent) this.hedgeLoading = true
      try {
        const [posRes, trdRes] = await Promise.all([
          getStrategyPositions(this.bot.id).catch(() => null),
          getStrategyTrades(this.bot.id, this.$i18n && this.$i18n.locale).catch(() => null)
        ])
        if (posRes && posRes.code === 1) {
          this.hedgePositions = (posRes.data && (posRes.data.positions || posRes.data.items)) || []
        }
        if (trdRes && trdRes.code === 1) {
          this.hedgeTrades = (trdRes.data && (trdRes.data.trades || trdRes.data.items)) || []
        }
      } finally {
        this.hedgeLoading = false
      }
    },
    formatLegSize (leg) {
      const sz = parseFloat(leg?.size || 0)
      if (!sz || sz <= 0) return '—'
      return sz.toFixed(6)
    },
    legPnl (leg) {
      const sz = parseFloat(leg?.size || 0)
      const ep = parseFloat(leg?.entry_price || 0)
      const cp = parseFloat(leg?.current_price || 0)
      if (!(sz > 0 && ep > 0 && cp > 0)) return 0
      const sign = String(leg.side).toLowerCase() === 'long' ? 1 : -1
      return sign * (cp - ep) * sz
    },
    legPnlClass (leg) {
      const v = this.legPnl(leg)
      if (v > 0) return 'profit'
      if (v < 0) return 'loss'
      return ''
    },
    formatPnl (v) {
      const n = parseFloat(v || 0)
      if (!isFinite(n) || Math.abs(n) < 1e-9) return '$0.00'
      const sign = n > 0 ? '+' : '-'
      return `${sign}$${Math.abs(n).toFixed(2)}`
    },
    formatDisplayItem (item) {
      const valueType = item?.value_type || 'text'
      const value = item?.value
      if (valueType === 'enum' && item?.value_key) return this.$t(item.value_key)
      if (valueType === 'bool') return value ? this.$t('trading-bot.common.enabled') : this.$t('trading-bot.common.disabled')
      if (valueType === 'percent') return `${this.formatNum(value)}%`
      if (valueType === 'usdt') return `${this.formatNum(value)} USDT`
      if (valueType === 'number' && typeof value === 'number') return this.formatNum(value)
      return String(value)
    },
    riskValueClass (key) {
      if (key === 'takeProfitPct') return 'success'
      if (key === 'stopLossPct' || key === 'maxDailyLoss') return 'danger'
      return ''
    },
    formatNum (v) {
      if (v === null || v === undefined) return '-'
      const n = parseFloat(v)
      if (isNaN(n)) return v
      return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    },
    formatUsdt (v) {
      const n = parseFloat(v)
      if (isNaN(n)) return '0.00'
      if (Math.abs(n) < 0.01) return n.toFixed(4)
      return n.toFixed(2)
    },
    formatPrice (v) {
      if (v === null || v === undefined) return '-'
      const n = parseFloat(v)
      if (isNaN(n)) return v
      if (n >= 1000) return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
      if (n >= 1) return n.toFixed(4)
      return n.toPrecision(6)
    },
    isNumeric (v) { return typeof v === 'number' || (typeof v === 'string' && !isNaN(parseFloat(v)) && isFinite(v)) },
    paramLabel (key) {
      if (this.isMartingaleBot) {
        const martingaleLabels = {
          initialAmount: this.$t('trading-bot.martingale.initialAmountAuto'),
          priceDropPct: this.$t('trading-bot.martingale.priceDropTrigger'),
          takeProfitPct: this.$t('trading-bot.martingale.avgEntryTakeProfit'),
          stopLossPct: this.$t('trading-bot.martingale.avgEntryStopLoss')
        }
        if (martingaleLabels[key]) return martingaleLabels[key]
      }
      // Trailing-TP fields share the same display across martingale & trend
      // bots; we don't have dedicated i18n keys for them yet so fall back
      // to inline zh/en labels (consistent with BotCreateWizard).
      const isZh = String(this.$i18n?.locale || '').toLowerCase().startsWith('zh')
      const trailingLabels = {
        trailingTpEnabled: isZh ? '启用追踪止盈' : 'Trailing TP',
        trailingTpActivationPct: isZh ? '追踪止盈激活涨幅' : 'Trailing TP Activation %',
        trailingTpCallbackPct: isZh ? '追踪止盈回撤幅度' : 'Trailing TP Callback %'
      }
      if (trailingLabels[key]) return trailingLabels[key]
      const i18nKey = PARAM_LABEL_MAP[key]
      if (i18nKey) return this.$t(i18nKey)
      return key.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase())
    },
    formatParamValue (key, val) {
      const displayMap = VALUE_DISPLAY_MAP[key]
      if (displayMap && displayMap[val]) return this.$t(displayMap[val])
      if (key === 'direction') {
        if (this.bot?.bot_type === 'trend') {
          return { long: this.$t('trading-bot.trend.longOnly'), short: this.$t('trading-bot.trend.shortOnly'), both: this.$t('trading-bot.trend.bothSides') }[val] || String(val)
        }
        return { long: this.$t('trading-bot.martingale.long'), short: this.$t('trading-bot.martingale.short') }[val] || String(val)
      }
      if (key === 'frequency') {
        return {
          every_bar: this.$t('trading-bot.dca.everyBar'),
          hourly: this.$t('trading-bot.dca.hourly'),
          '4h': '4H',
          daily: this.$t('trading-bot.dca.daily'),
          weekly: this.$t('trading-bot.dca.weekly'),
          biweekly: this.$t('trading-bot.dca.biweekly'),
          monthly: this.$t('trading-bot.dca.monthly')
        }[val] || String(val)
      }
      if (val === 'true' || val === 'false') return val === 'true' ? this.$t('trading-bot.common.enabled') : this.$t('trading-bot.common.disabled')
      if (typeof val === 'boolean') return val ? this.$t('trading-bot.common.enabled') : this.$t('trading-bot.common.disabled')
      if (['priceDropPct', 'takeProfitPct', 'stopLossPct', 'positionPct', 'dipThreshold',
           'trailingTpActivationPct', 'trailingTpCallbackPct', 'initialPositionPct', 'waterfallDropPct'].includes(key)) {
        return `${this.formatNum(val)}%`
      }
      if (['initialAmount', 'amountEach', 'amountPerGrid', 'referencePrice', 'totalBudget'].includes(key)) {
        return `${this.formatNum(val)} USDT`
      }
      if (typeof val === 'number') return this.formatNum(val)
      return String(val)
    },
    fetchKlineForGrid () {
      const symbol = this.tc.symbol
      if (!symbol) return
      // Use the bot's actual market_category instead of hard-coding Crypto
      // so the grid background renders correctly for USStock / Forex bots
      // too (the kline endpoint dispatches to yfinance / Twelve Data based
      // on this market parameter).
      const market = (this.bot && this.bot.market_category) || 'Crypto'
      this.klineLoading = true
      request({
        url: '/api/indicator/kline',
        method: 'get',
        params: { market, symbol, timeframe: '1H', limit: 200 }
      }).then(res => {
        if (res && res.code === 1 && Array.isArray(res.data)) {
          this.klineData = res.data
        }
      }).catch(() => {}).finally(() => { this.klineLoading = false })
    },
    drawKlineBackground () {
      this.$nextTick(() => {
        const canvas = this.$refs.klineCanvas
        const wrap = this.$refs.gridChartWrap
        if (!canvas || !wrap || !this.klineData.length) return

        const rect = wrap.getBoundingClientRect()
        if (rect.width < 10 || rect.height < 10) return
        const dpr = window.devicePixelRatio || 1
        const W = rect.width
        const H = rect.height
        canvas.width = W * dpr
        canvas.height = H * dpr
        canvas.style.width = W + 'px'
        canvas.style.height = H + 'px'

        const ctx = canvas.getContext('2d')
        ctx.scale(dpr, dpr)
        ctx.clearRect(0, 0, W, H)

        const { upperPrice, lowerPrice } = this.gp
        if (!upperPrice || !lowerPrice || upperPrice <= lowerPrice) return

        const priceRange = upperPrice - lowerPrice
        const margin = priceRange * 0.05
        const visLow = lowerPrice - margin
        const visHigh = upperPrice + margin
        const visRange = visHigh - visLow

        const bars = this.klineData.filter(k => k.high >= visLow && k.low <= visHigh)
        if (!bars.length) return

        const padL = 8; const padR = 72; const padT = 6; const padB = 6
        const drawW = W - padL - padR
        const drawH = H - padT - padB
        const barW = Math.max(1, Math.min(8, (drawW / bars.length) * 0.7))
        const gap = drawW / bars.length
        const toY = (p) => padT + drawH - ((p - visLow) / visRange) * drawH

        const dk = this.isDark
        const cBull = dk ? 'rgba(82,196,26,0.4)' : 'rgba(82,196,26,0.3)'
        const cBear = dk ? 'rgba(245,34,45,0.4)' : 'rgba(245,34,45,0.3)'
        const wBull = dk ? 'rgba(82,196,26,0.3)' : 'rgba(82,196,26,0.2)'
        const wBear = dk ? 'rgba(245,34,45,0.3)' : 'rgba(245,34,45,0.2)'

        for (let i = 0; i < bars.length; i++) {
          const k = bars[i]
          const cx = padL + i * gap + gap / 2
          const bull = k.close >= k.open
          const bTop = toY(Math.max(k.open, k.close))
          const bBot = toY(Math.min(k.open, k.close))
          const bH = Math.max(0.5, bBot - bTop)
          ctx.beginPath()
          ctx.strokeStyle = bull ? wBull : wBear
          ctx.lineWidth = 0.5
          ctx.moveTo(cx, toY(k.high))
          ctx.lineTo(cx, toY(k.low))
          ctx.stroke()
          ctx.fillStyle = bull ? cBull : cBear
          ctx.fillRect(cx - barW / 2, bTop, barW, bH)
        }
      })
    }
  }
}
</script>

<style lang="less" scoped>
.detail-header-card,
.detail-tabs-card {
  border-radius: 12px;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.06);
}

.detail-header {
  display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px;
  .header-left { display: flex; align-items: center; gap: 14px; flex: 1; }
  .type-icon { width: 44px; height: 44px; border-radius: 12px; display: flex; align-items: center; justify-content: center; color: #fff; font-size: 22px; flex-shrink: 0; }
  .header-info h3 { font-size: 18px; font-weight: 700; margin: 0 0 6px; color: #262626; }
  .header-tags { display: flex; gap: 6px; flex-wrap: wrap; }
  .header-actions { display: flex; gap: 8px; flex-shrink: 0; }
}

/* ===================== 参数面板 ===================== */
.params-panel { padding: 4px 0; }
.params-section {
  margin-bottom: 20px;
  &__title {
    display: flex; align-items: center; gap: 8px; font-size: 15px; font-weight: 600;
    color: #262626; margin-bottom: 14px; padding-bottom: 8px; border-bottom: 1px solid #f0f0f0;
    .anticon { color: #667eea; font-size: 16px; }
  }
}
.params-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 12px; }
.param-item {
  display: flex; flex-direction: column; gap: 4px; padding: 10px 14px;
  background: #fafafa; border-radius: 8px; border: 1px solid #f0f0f0;
  .param-label { font-size: 12px; color: #8c8c8c; line-height: 1.4; }
  .param-value { font-size: 14px; font-weight: 500; color: #262626;
    &.highlight { font-weight: 700; color: #1890ff; }
    &.danger { color: #f5222d; }
    &.success { color: #52c41a; }
  }
}

/* ===================== 实时挂单 ===================== */
.resting-orders-panel { padding: 4px 0; }
.resting-orders-toolbar {
  display: flex; align-items: center; gap: 8px; margin-bottom: 12px;
  .resting-orders-hint { font-size: 12px; color: #8c8c8c; }
}

/* ===================== 网格预览 ===================== */
.grid-preview-panel { padding: 4px 0; }
.grid-overview {
  display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 10px; margin-bottom: 20px;
  &__item {
    display: flex; flex-direction: column; gap: 4px; padding: 12px 14px;
    background: linear-gradient(135deg, rgba(102,126,234,0.04) 0%, rgba(118,75,162,0.04) 100%);
    border: 1px solid rgba(102,126,234,0.12); border-radius: 8px;
    .ov-label { font-size: 12px; color: #8c8c8c; }
    .ov-value { font-size: 15px; font-weight: 600; color: #262626; &.highlight { color: #667eea; } }
  }
}
.grid-note {
  display: flex; align-items: flex-start; gap: 8px; margin-bottom: 16px; padding: 10px 14px;
  background: rgba(24,144,255,0.04); border: 1px dashed rgba(24,144,255,0.2); border-radius: 8px;
  font-size: 12px; color: #8c8c8c; line-height: 1.6;
  .anticon { color: #1890ff; margin-top: 2px; flex-shrink: 0; }
}

/* -------- 左右两列挂单 -------- */
.grid-orders-split {
  display: flex; gap: 16px; margin-bottom: 20px;
}
.grid-orders-col {
  flex: 1; min-width: 0; border-radius: 10px; overflow: hidden;
  border: 1px solid #f0f0f0;
  &__header {
    display: flex; align-items: center; gap: 6px; padding: 10px 14px;
    font-size: 14px; font-weight: 600;
  }
  &__header--long { background: rgba(82,196,26,0.06); color: #52c41a; border-bottom: 1px solid rgba(82,196,26,0.15); }
  &__header--short { background: rgba(245,34,45,0.06); color: #f5222d; border-bottom: 1px solid rgba(245,34,45,0.15); }
  &__count {
    margin-left: auto; background: rgba(0,0,0,0.06); border-radius: 10px; padding: 0 8px;
    font-size: 12px; color: #8c8c8c; font-weight: 500;
  }
  &__list { max-height: 380px; overflow-y: auto; padding: 4px 0; }
  &__empty { text-align: center; padding: 24px; color: #bfbfbf; }
}
.grid-order-item {
  display: flex; align-items: center; gap: 8px; padding: 7px 14px; font-size: 13px;
  border-bottom: 1px solid rgba(0,0,0,0.03);
  &:last-child { border-bottom: none; }
  &__level { font-weight: 600; color: #bfbfbf; min-width: 32px; font-size: 12px; }
  &__price { font-family: 'SF Mono','Monaco','Consolas',monospace; font-weight: 600; }
  &__target { color: #8c8c8c; font-size: 12px; font-family: 'SF Mono','Monaco','Consolas',monospace; }
  &__profit { margin-left: auto; font-weight: 600; font-size: 12px; }
  &--long &__price { color: #389e0d; }
  &--long &__profit { color: #52c41a; }
  &--short &__price { color: #cf1322; }
  &--short &__profit { color: #52c41a; }
}
.grid-orders-entry {
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: 6px; padding: 0 8px; flex-shrink: 0;
  &__badge {
    width: 36px; height: 36px; border-radius: 50%; display: flex; align-items: center; justify-content: center;
    background: linear-gradient(135deg, #1890ff, #667eea); color: #fff; font-size: 18px;
  }
  &__price { font-family: 'SF Mono','Monaco','Consolas',monospace; font-weight: 700; font-size: 13px; color: #1890ff; }
  &__label { font-size: 11px; color: #8c8c8c; }
}

/* -------- K线可视化 -------- */
.grid-visual {
  margin-top: 16px;
  &__title {
    display: flex; align-items: center; gap: 8px; font-size: 14px; font-weight: 600;
    color: #262626; margin-bottom: 12px;
    .anticon { color: #667eea; }
  }
  &__chart {
    position: relative; height: 400px; max-height: 50vh;
    background: linear-gradient(180deg, rgba(245,34,45,0.02) 0%, rgba(82,196,26,0.02) 100%);
    border: 1px solid #f0f0f0; border-radius: 8px; padding: 8px 80px 8px 12px; overflow: hidden;
  }
  &__loading { font-size: 12px; color: #8c8c8c; font-weight: 400; margin-left: 8px; }
}
.grid-kline-canvas { position: absolute; top: 0; left: 0; width: 100%; height: 100%; pointer-events: none; z-index: 0; }
.grid-line {
  position: absolute; left: 12px; right: 12px; height: 0; z-index: 1;
  &__bar { width: 100%; height: 1px; background: rgba(102,126,234,0.15); }
  &__price {
    position: absolute; right: 0; top: -8px; font-size: 10px;
    font-family: 'SF Mono','Monaco','Consolas',monospace; color: #8c8c8c;
    white-space: nowrap; background: rgba(255,255,255,0.85); padding: 0 3px; border-radius: 2px;
  }
  &--buy &__bar { background: rgba(82,196,26,0.55); }
  &--buy &__price { color: #52c41a; }
  &--sell &__bar { background: rgba(245,34,45,0.55); }
  &--sell &__price { color: #f5222d; }
  &--mid &__bar { height: 2px; background: #1890ff; }
  &--mid &__price { color: #1890ff; font-weight: 700; }
}

/* ===================== Hedge summary (grid / DCA) ===================== */
.hedge-summary-card {
  border-radius: 12px;
  background: linear-gradient(135deg, rgba(102,126,234,0.06) 0%, rgba(118,75,162,0.06) 100%);
}
.hedge-summary {
  &__title {
    display: flex; align-items: center; gap: 8px;
    font-size: 13px; font-weight: 600; color: #595959; margin-bottom: 12px;
    .anticon { color: #667eea; }
  }
  &__tip { color: #bfbfbf; cursor: help; }
  &__grid {
    display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px;
  }
}
.hedge-cell {
  padding: 12px 14px; border-radius: 10px; background: #fff; border: 1px solid #f0f0f0;
  &__label { font-size: 12px; color: #8c8c8c; margin-bottom: 6px; }
  &__size { font-size: 22px; font-weight: 700; color: #262626; font-family: 'SF Mono', monospace; }
  &__sub { font-size: 12px; color: #8c8c8c; margin-top: 4px;
    .hedge-cell__pnl { margin-left: 8px; font-weight: 600;
      &.profit { color: #52c41a; }
      &.loss { color: #f5222d; }
    }
  }
  &__sub-divider { margin: 0 4px; color: #d9d9d9; }
  &--long { border-left: 3px solid #52c41a; }
  &--short { border-left: 3px solid #f5222d; }
  &--grid { border-left: 3px solid #1890ff;
    .hedge-cell__size .profit { color: #52c41a; }
    .hedge-cell__size .loss { color: #f5222d; }
  }
}

/* ===================== 暗黑模式 ===================== */
.theme-dark {
  .detail-header-card, .detail-tabs-card, .hedge-summary-card { background: #1f1f1f; box-shadow: 0 2px 12px rgba(0,0,0,0.3); }
  .hedge-summary-card { background: linear-gradient(135deg, rgba(102,126,234,0.1) 0%, rgba(118,75,162,0.1) 100%); }
  .hedge-summary__title { color: #d9d9d9; }
  .hedge-cell { background: #141414; border-color: #303030;
    &__label { color: #8c8c8c; }
    &__size { color: #e8e8e8; }
    &__sub { color: #595959; }
  }
  .header-info h3 { color: #e8e8e8; }
  .params-section__title { color: #d9d9d9; border-bottom-color: #303030; }
  .param-item { background: #141414; border-color: #303030;
    .param-label { color: #8c8c8c; }
    .param-value { color: #e8e8e8; }
  }
  .grid-overview__item {
    background: linear-gradient(135deg, rgba(102,126,234,0.08) 0%, rgba(118,75,162,0.08) 100%);
    border-color: rgba(102,126,234,0.2);
    .ov-label { color: #8c8c8c; }
    .ov-value { color: #e8e8e8; }
  }
  .grid-note { background: rgba(24,144,255,0.06); border-color: rgba(24,144,255,0.15); color: #8c8c8c; }
  .grid-orders-col { border-color: #303030; }
  .grid-orders-col__header--long { background: rgba(82,196,26,0.1); border-bottom-color: rgba(82,196,26,0.2); }
  .grid-orders-col__header--short { background: rgba(245,34,45,0.1); border-bottom-color: rgba(245,34,45,0.2); }
  .grid-orders-col__count { background: rgba(255,255,255,0.06); color: #8c8c8c; }
  .grid-order-item { border-bottom-color: rgba(255,255,255,0.04); }
  .grid-order-item__level { color: #595959; }
  .grid-order-item__target { color: #595959; }
  .grid-order-item--long .grid-order-item__price { color: #73d13d; }
  .grid-order-item--short .grid-order-item__price { color: #ff4d4f; }
  .grid-orders-entry__price { color: #40a9ff; }
  .grid-orders-entry__label { color: #595959; }
  .grid-visual__title { color: #d9d9d9; }
  .grid-visual__chart { background: rgba(255,255,255,0.02); border-color: #303030; }
  .grid-line__price { background: rgba(20,20,20,0.88); color: #8c8c8c; }
  .grid-line--buy .grid-line__price { color: #73d13d; }
  .grid-line--sell .grid-line__price { color: #ff4d4f; }
  .grid-line--mid .grid-line__price { color: #40a9ff; }
}
</style>
