import { i18n } from "../i18n"
import { FullSlug, joinSegments, pathToRoot } from "../util/path"
import { CSSResourceToStyleElement, JSResourceToScriptElement } from "../util/resources"
import { googleFontHref } from "../util/theme"
import { QuartzComponent, QuartzComponentConstructor, QuartzComponentProps } from "./types"
import satori, { SatoriOptions } from "satori"
import fs from "fs"
import sharp from "sharp"
import { ImageOptions, SocialImageOptions, getSatoriFont, defaultImage } from "../util/og"
import { unescapeHTML } from "../util/escape"

/**
 * Generates social image (OG/twitter standard) and saves it as `.webp` inside the public folder
 * @param opts options for generating image
 */
async function generateSocialImage(
  { cfg, description, fileName, fontsPromise, title, fileData }: ImageOptions,
  userOpts: SocialImageOptions,
  imageDir: string,
) {
  const fonts = await fontsPromise
  const { width, height } = userOpts

  // JSX that will be used to generate satori svg
  const imageComponent = userOpts.imageStructure(cfg, userOpts, title, description, fonts, fileData)

  const svg = await satori(imageComponent, { width, height, fonts })

  // Convert svg directly to webp (with additional compression)
  const compressed = await sharp(Buffer.from(svg)).webp({ quality: 40 }).toBuffer()

  // Write to file system
  const filePath = joinSegments(imageDir, `${fileName}.${extension}`)
  fs.writeFileSync(filePath, compressed)
}

const extension = "webp"

const defaultOptions: SocialImageOptions = {
  colorScheme: "lightMode",
  width: 1200,
  height: 630,
  imageStructure: defaultImage,
  excludeRoot: false,
}

export default (() => {
  let fontsPromise: Promise<SatoriOptions["fonts"]>

  let fullOptions: SocialImageOptions
  const Head: QuartzComponent = ({
    cfg,
    fileData,
    externalResources,
    ctx,
  }: QuartzComponentProps) => {
    // Initialize options if not set
    if (!fullOptions) {
      if (typeof cfg.generateSocialImages !== "boolean") {
        fullOptions = { ...defaultOptions, ...cfg.generateSocialImages }
      } else {
        fullOptions = defaultOptions
      }
    }

    // Memoize google fonts
    if (!fontsPromise && cfg.generateSocialImages) {
      fontsPromise = getSatoriFont(cfg.theme.typography.header, cfg.theme.typography.body)
    }

    const slug = fileData.filePath
    // since "/" is not a valid character in file names, replace with "-"
    const fileName = slug?.replaceAll("/", "-")

    // Get file description (priority: frontmatter > fileData > default)
    const fdDescription =
      fileData.description?.trim() ?? i18n(cfg.locale).propertyDefaults.description
    const titleSuffix = cfg.pageTitleSuffix ?? ""
    const title =
      (fileData.frontmatter?.title ?? i18n(cfg.locale).propertyDefaults.title) + titleSuffix
    let description = ""
    if (fdDescription) {
      description = unescapeHTML(fdDescription)
    }

    if (fileData.frontmatter?.socialDescription) {
      description = fileData.frontmatter?.socialDescription as string
    } else if (fileData.frontmatter?.description) {
      description = fileData.frontmatter?.description
    }

    const fileDir = joinSegments(ctx.argv.output, "static", "social-images")
    if (cfg.generateSocialImages) {
      // Generate folders for social images (if they dont exist yet)
      if (!fs.existsSync(fileDir)) {
        fs.mkdirSync(fileDir, { recursive: true })
      }

      if (fileName) {
        // Generate social image (happens async)
        generateSocialImage(
          {
            title,
            description,
            fileName,
            fileDir,
            fileExt: extension,
            fontsPromise,
            cfg,
            fileData,
          },
          fullOptions,
          fileDir,
        )
      }
    }

    const { css, js } = externalResources

    const url = new URL(`https://${cfg.baseUrl ?? "example.com"}`)
    const path = url.pathname as FullSlug
    const baseDir = fileData.slug === "404" ? path : pathToRoot(fileData.slug!)

    const iconPath = joinSegments(baseDir, "static/icon.svg")

    const ogImageDefaultPath = `https://${cfg.baseUrl}/static/og-image.png`
    // "static/social-images/slug-filename.md.webp"
    const ogImageGeneratedPath = `https://${cfg.baseUrl}/${fileDir.replace(
      `${ctx.argv.output}/`,
      "",
    )}/${fileName}.${extension}`

    // Use default og image if filePath doesnt exist (for autogenerated paths with no .md file)
    const useDefaultOgImage = fileName === undefined || !cfg.generateSocialImages

    // Path to og/social image (priority: frontmatter > generated image (if enabled) > default image)
    let ogImagePath = useDefaultOgImage ? ogImageDefaultPath : ogImageGeneratedPath

    // TODO: could be improved to support external images in the future
    // Aliases for image and cover handled in `frontmatter.ts`
    const frontmatterImgUrl = fileData.frontmatter?.socialImage

    // Override with default og image if config option is set
    if (fileData.slug === "index") {
      ogImagePath = ogImageDefaultPath
    }

    // Override with frontmatter url if existing
    if (frontmatterImgUrl) {
      ogImagePath = `https://${cfg.baseUrl}/static/${frontmatterImgUrl}`
    }

    // Url of current page
    const socialUrl =
      fileData.slug === "404" ? url.toString() : joinSegments(url.toString(), fileData.slug!)

    return (
      <head>
        <title>{title}</title>
        <meta charSet="utf-8" />
        {cfg.theme.cdnCaching && cfg.theme.fontOrigin === "googleFonts" && (
          <>
            <link rel="preconnect" href="https://fonts.googleapis.com" />
            <link rel="preconnect" href="https://fonts.gstatic.com" />
            <link rel="stylesheet" href={googleFontHref(cfg.theme)} />
          </>
        )}
        <link rel="preconnect" href="https://cdnjs.cloudflare.com" crossOrigin={"anonymous"} />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        {/* OG/Twitter meta tags */}
        <meta name="og:site_name" content={cfg.pageTitle}></meta>
        <meta property="og:title" content={title} />
        <meta property="og:type" content="website" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={title} />
        <meta name="twitter:description" content={description} />
        <meta property="og:description" content={description} />
        <meta property="og:image:type" content={`image/${extension}`} />
        <meta property="og:image:alt" content={description} />
        {/* Dont set width and height if unknown (when using custom frontmatter image) */}
        {!frontmatterImgUrl && (
          <>
            <meta property="og:image:width" content={fullOptions.width.toString()} />
            <meta property="og:image:height" content={fullOptions.height.toString()} />
          </>
        )}
        <meta property="og:image:url" content={ogImagePath} />
        {cfg.baseUrl && (
          <>
            <meta name="twitter:image" content={ogImagePath} />
            <meta property="og:image" content={ogImagePath} />
            <meta property="twitter:domain" content={cfg.baseUrl}></meta>
            <meta property="og:url" content={socialUrl}></meta>
            <meta property="twitter:url" content={socialUrl}></meta>
          </>
        )}
        <link rel="icon" href={iconPath} />
        <meta name="description" content={description} />
        <meta name="generator" content="Quartz" />
        {css.map((resource) => CSSResourceToStyleElement(resource, true))}
        {js
          .filter((resource) => resource.loadTime === "beforeDOMReady")
          .map((res) => JSResourceToScriptElement(res, true))}
      </head>
    )
  }

  return Head
}) satisfies QuartzComponentConstructor
