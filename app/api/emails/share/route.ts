import { NextResponse } from "next/server";
import puppeteer from "puppeteer";
import {
  buildHtmlEmail,
  type HtmlEmailOverrides,
} from "@/lib/email-html-template";

export async function POST() {
  try {
    // Build a generic version of the HTML email
    const genericData = {
      businessName: "votre entreprise",
      rating: null,
      reviewCount: null,
      category: null,
      address: null,
      hasWebsite: false,
    };

    const genericOverrides: HtmlEmailOverrides = {
      heroHeading: "Un site web qui reflète la qualité de votre entreprise",
      heroSubtitle:
        "Bonjour, je suis développeur web à Bruxelles. J'ai remarqué que **votre entreprise** pourrait bénéficier d'une présence en ligne moderne et performante.",
      personalMessage:
        "Avec votre excellente réputation dans votre secteur d'activité, un site web professionnel vous permettrait de convertir cette visibilité en clients potentiels.\n\n" +
        "Je peux également développer **une application sur mesure** pour simplifier votre gestion au quotidien : **comptabilité**, **planning du personnel** ou **suivi des stocks** ; le tout accessible depuis n'importe quel appareil.\n\n" +
        "Je serais ravi d'en discuter autour d'un café ou lors d'un court appel téléphonique, sans engagement.\n\n" +
        "Bien cordialement,",
    };

    const html = buildHtmlEmail(genericData, genericOverrides);

    // Generate PDF with puppeteer
    const browser = await puppeteer.launch({ headless: true });
    const page = await browser.newPage();
    await page.setViewport({ width: 700, height: 800 });
    await page.setContent(html, { waitUntil: "networkidle0" });

    // Remove the footer section and everything after the CTA button,
    // then size the PDF to fit exactly
    const bodyHeight = await page.evaluate(() => {
      // Remove the FOOTER table (dark section with Portfolio/GitHub/LinkedIn)
      const allTables = document.querySelectorAll("table[align='center']");
      allTables.forEach((table) => {
        const el = table as HTMLElement;
        if (el.innerHTML.includes("Portfolio") || el.innerHTML.includes("GitHub")) {
          el.remove();
        }
      });

      // Set background to dark to match the CTA section ending
      document.body.style.background = "#0d0b0e";
      document.documentElement.style.background = "#0d0b0e";
      document.body.style.margin = "0";
      document.body.style.padding = "0";

      const el = document.querySelector("body > table") as HTMLElement;
      return el ? el.offsetHeight : document.body.scrollHeight;
    });

    const pdfBuffer = await page.pdf({
      width: "700px",
      height: `${bodyHeight}px`,
      printBackground: true,
      margin: { top: "0", right: "0", bottom: "0", left: "0" },
    });

    await browser.close();

    return new NextResponse(pdfBuffer, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": "attachment; filename=proposition-web.pdf",
      },
    });
  } catch (error) {
    console.error("Share email error:", error);
    return NextResponse.json(
      { success: false, error: "An internal error occurred" },
      { status: 500 }
    );
  }
}
