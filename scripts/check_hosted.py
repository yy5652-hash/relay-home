"""Clicks through the hosted demo the way a visitor would and reports what the page showed.

    <python with playwright> check_hosted.py [https://relay-home.onrender.com]
"""
import asyncio
import sys

from playwright.async_api import async_playwright

URL = sys.argv[1] if len(sys.argv) > 1 else "https://relay-home.onrender.com"


async def main():
    async with async_playwright() as pw:
        browser = await pw.chromium.launch()
        page = await browser.new_page(viewport={"width": 1440, "height": 900})
        errors = []
        page.on("pageerror", lambda e: errors.append(str(e)[:160]))

        async def settle(n):
            await page.wait_for_function(f'document.querySelectorAll(".bubble.relay").length >= {n} && !document.body.classList.contains("busy")', timeout=60000)
            await page.wait_for_timeout(900)

        last = lambda: page.eval_on_selector_all(".bubble.relay", "n => n.at(-1).textContent")
        await page.goto(URL, timeout=90000)
        await page.wait_for_function("document.querySelector('#notice').textContent.length > 0", timeout=60000)
        await page.click('[data-say^="School moved"]'); await settle(1); print("1", await last())
        await page.frame_locator('figure[data-view$="plan.html"] iframe').get_by_role("button", name="Ask Jo").click()
        await page.wait_for_selector("#sheet:not([hidden])", timeout=30000); print("  sheet:", await page.inner_text("#question"))
        await page.click("#yes"); await settle(2); print("2", await last())
        await page.get_by_role("button", name="Jo says yes").click(); await settle(3); print("3", await last())
        await page.click('[data-say^="Make the pasta"]')
        await page.wait_for_selector("#sheet:not([hidden])", timeout=30000); print("  sheet:", await page.inner_text("#question"))
        await page.click("#yes"); await settle(4); print("4", await last())
        await page.wait_for_timeout(4500)
        print("chips:", await page.eval_on_selector_all(".facts span", "n => n.map(x => x.textContent)"))
        print("cards:", await page.eval_on_selector_all("figcaption", "n => n.map(x => x.textContent.slice(18, 40))"))
        plan = page.frame_locator('figure[data-view$="plan.html"] iframe')
        print("evening card:", (await plan.locator("header").inner_text()).replace("\n", " · "))
        print("endpoint shown:", await page.inner_text("#endpoint"), "| page errors:", errors)
        await browser.close()

asyncio.run(main())
