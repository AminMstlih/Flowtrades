"""
Terminal Footprint Display — Rich-formatted live table.

Renders the footprint state as a color-coded terminal table
with 500ms refresh. This is the primary output surface for Phase 1.

Architecture doc Section 5.2.
"""

from __future__ import annotations

import asyncio
from datetime import datetime, timezone

from rich.console import Console
from rich.live import Live
from rich.panel import Panel
from rich.table import Table
from rich.text import Text

from aggregation.engine import PriceBucket
from state.state import FootprintState


class TerminalDisplay:
    """
    Live terminal footprint display using Rich.

    Columns: Price | Buy Vol | Sell Vol | Delta | Imbalance | Total Vol
    Color coding per architecture spec.
    """

    def __init__(
        self,
        state: FootprintState,
        num_rows: int = 20,
        refresh_rate_ms: int = 500,
        min_volume_btc: float = 0.5,
        imbalance_threshold: float = 70.0,
    ) -> None:
        self.state = state
        self.num_rows = num_rows
        self.refresh_rate_s = refresh_rate_ms / 1000.0
        self.min_volume_btc = min_volume_btc
        self.imbalance_threshold = imbalance_threshold
        self.console = Console()
        self._running = False

    def _build_header(self) -> Text:
        """Build the status header with live stats."""
        stats = self.state.stats
        last_price = stats["last_price"]
        trade_count = stats["total_trades_processed"]
        active_buckets = stats["active_buckets"]
        window_min = stats["window_seconds"] // 60
        total_candles = stats["total_candles"]

        price_str = f"${last_price:,.2f}" if last_price else "---"

        header = Text()
        header.append("BTC ORDER FLOW LITE", style="bold white")
        header.append("  |  ", style="dim")
        header.append("MULTI-EXCHANGE PERP", style="bold cyan")
        header.append("  |  ", style="dim")
        header.append(f"Last: {price_str}", style="bold yellow")
        header.append("  |  ", style="dim")
        header.append(f"Interval: {window_min}m", style="green")
        header.append("  |  ", style="dim")
        header.append(f"Trades: {trade_count:,}", style="dim white")
        header.append("  |  ", style="dim")
        header.append(f"Candles: {total_candles}", style="dim white")
        header.append("  |  ", style="dim")
        header.append(f"Buckets: {active_buckets}", style="dim white")

        return header

    def _build_table(self, buckets: list[PriceBucket]) -> Table:
        """Build the footprint table from bucket data."""
        table = Table(
            show_header=True,
            header_style="bold white on grey23",
            border_style="dim",
            pad_edge=True,
            expand=True,
        )

        table.add_column("Price", justify="right", style="bold white", width=12)
        table.add_column("Buy Vol", justify="right", width=10)
        table.add_column("Sell Vol", justify="right", width=10)
        table.add_column("Delta", justify="right", width=12)
        table.add_column("Imbalance", justify="center", width=12)
        table.add_column("Total Vol", justify="right", style="dim", width=10)

        if not buckets:
            table.add_row(
                "", "", "", "Waiting for trades...", "", "",
                style="dim italic",
            )
            return table

        for bucket in buckets:
            # Price
            price_str = f"{bucket.price:,.0f}"

            # Buy volume — green
            buy_str = Text(f"{bucket.buy_vol:.3f}", style="green")

            # Sell volume — red
            sell_str = Text(f"{bucket.sell_vol:.3f}", style="red")

            # Delta — green if positive, red if negative
            delta = bucket.delta
            if delta >= 0:
                delta_str = Text(f"+{delta:.3f}", style="bold green")
            else:
                delta_str = Text(f"{delta:.3f}", style="bold red")

            # Imbalance — only show if volume exceeds minimum threshold
            imb = bucket.imbalance_pct
            if imb is not None and bucket.total_vol >= self.min_volume_btc:
                if abs(imb) >= self.imbalance_threshold:
                    if imb > 0:
                        imb_str = Text(f"+{imb:.0f}%", style="bold green")
                    else:
                        imb_str = Text(f"{imb:.0f}%", style="bold red")
                else:
                    imb_str = Text(f"{imb:+.0f}%", style="dim")
            else:
                imb_str = Text("--", style="dim")

            # Total volume
            total_str = f"{bucket.total_vol:.3f}"

            # Row highlight for strong imbalance
            row_style = ""
            if (
                imb is not None
                and abs(imb) >= self.imbalance_threshold
                and bucket.total_vol >= self.min_volume_btc
            ):
                row_style = "on grey15"

            table.add_row(
                price_str,
                buy_str,
                sell_str,
                delta_str,
                imb_str,
                total_str,
                style=row_style,
            )

        return table

    def _build_footer(self) -> Text:
        """Build footer with timestamp and controls."""
        footer = Text()
        now = datetime.now(timezone.utc).strftime("%H:%M:%S UTC")
        footer.append(f"  Updated: {now}", style="dim")
        footer.append("  |  ", style="dim")
        footer.append("Ctrl+C to exit", style="dim italic")
        return footer

    def _get_active_buckets(self) -> list[PriceBucket]:
        """
        Extract price buckets from the active candle for terminal display.

        Returns the top N buckets sorted by price descending.
        """
        candles = self.state.get_display_state()
        if not candles:
            return []

        # Use the most recent (active) candle for terminal display
        active = candles[-1]
        buckets = list(active.buckets.values())

        # Sort by price descending (highest price at top)
        buckets.sort(key=lambda b: b.price, reverse=True)

        # Truncate to num_rows
        return buckets[: self.num_rows]

    async def run(self) -> None:
        """Main display loop with Rich Live."""
        self._running = True

        with Live(
            console=self.console,
            refresh_per_second=int(1 / self.refresh_rate_s),
            screen=True,
        ) as live:
            while self._running:
                try:
                    # Get current state
                    buckets = self._get_active_buckets()

                    # Build layout
                    header = self._build_header()
                    table = self._build_table(buckets)
                    footer = self._build_footer()

                    # Compose panel
                    panel = Panel(
                        table,
                        title=header,
                        subtitle=footer,
                        border_style="cyan",
                        padding=(0, 1),
                    )

                    live.update(panel)

                    await asyncio.sleep(self.refresh_rate_s)

                except asyncio.CancelledError:
                    break

        self._running = False

    async def stop(self) -> None:
        """Stop the display loop."""
        self._running = False
