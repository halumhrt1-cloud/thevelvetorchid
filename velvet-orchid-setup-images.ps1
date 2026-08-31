# Run this script from the root of your The Velvet Orchid Astro project.
$ErrorActionPreference = "Stop"

$assetsDir = Join-Path (Get-Location) "src\assets"
$blogPage = Join-Path (Get-Location) "src\pages\blog\index.astro"

New-Item -ItemType Directory -Force $assetsDir | Out-Null

$images = @(
    @{
        Name = "cozy-plants-1.jpg"
        Url = "https://images.unsplash.com/photo-1765192846136-afe09533db68?auto=format&fit=crop&fm=jpg&q=85&w=1400"
    },
    @{
        Name = "cozy-plants-2.jpg"
        Url = "https://images.unsplash.com/photo-1749372523243-1c0585ac3bef?auto=format&fit=crop&fm=jpg&q=85&w=1400"
    },
    @{
        Name = "cozy-plants-3.jpg"
        Url = "https://images.unsplash.com/photo-1723324471072-7df0ffe08fa6?auto=format&fit=crop&fm=jpg&q=85&w=1400"
    },
    @{
        Name = "cozy-plants-4.jpg"
        Url = "https://images.unsplash.com/photo-1776729833778-aab44f884004?auto=format&fit=crop&fm=jpg&q=85&w=1400"
    },
    @{
        Name = "cozy-plants-5.jpg"
        Url = "https://images.unsplash.com/photo-1753770960073-ff5c58fd9cfb?auto=format&fit=crop&fm=jpg&q=85&w=1400"
    }
)

foreach ($image in $images) {
    $target = Join-Path $assetsDir $image.Name
    Write-Host "Downloading $($image.Name)..."
    curl.exe -L --fail --silent --show-error $image.Url -o $target
    if (!(Test-Path $target) -or (Get-Item $target).Length -lt 10000) {
        throw "Download failed or image is too small: $($image.Name)"
    }
}

$astro = @'
---
import { Image } from 'astro:assets';
import { getCollection } from 'astro:content';
import BaseHead from '../../components/BaseHead.astro';
import Footer from '../../components/Footer.astro';
import FormattedDate from '../../components/FormattedDate.astro';
import Header from '../../components/Header.astro';
import { SITE_DESCRIPTION, SITE_TITLE } from '../../consts';

import cozy1 from '../../assets/cozy-plants-1.jpg';
import cozy2 from '../../assets/cozy-plants-2.jpg';
import cozy3 from '../../assets/cozy-plants-3.jpg';
import cozy4 from '../../assets/cozy-plants-4.jpg';
import cozy5 from '../../assets/cozy-plants-5.jpg';

const posts = (await getCollection('blog')).sort(
    (a, b) => b.data.pubDate.valueOf() - a.data.pubDate.valueOf(),
);

const heroImages = [cozy1, cozy2, cozy3, cozy4, cozy5];
---

<!doctype html>
<html lang="en">
    <head>
        <BaseHead title={SITE_TITLE} description={SITE_DESCRIPTION} />
        <style>
            main {
                width: 960px;
            }

            ul {
                display: flex;
                flex-wrap: wrap;
                gap: 2rem;
                list-style-type: none;
                margin: 0;
                padding: 0;
            }

            ul li {
                width: calc(50% - 1rem);
            }

            ul li * {
                text-decoration: none;
                transition: 0.2s ease;
            }

            ul li:first-child {
                width: 100%;
                margin-bottom: 1rem;
                text-align: center;
            }

            ul li:first-child img {
                width: 100%;
            }

            ul li:first-child .title {
                font-size: 2.369rem;
            }

            ul li img {
                width: 100%;
                height: 360px;
                object-fit: cover;
                margin-bottom: 0.5rem;
                border-radius: 12px;
            }

            ul li a {
                display: block;
            }

            .title {
                margin: 0;
                color: rgb(var(--black));
                line-height: 1;
            }

            .date {
                margin: 0;
                color: rgb(var(--gray));
            }

            ul li a:hover h4,
            ul li a:hover .date {
                color: rgb(var(--accent));
            }

            ul a:hover img {
                box-shadow: var(--box-shadow);
                transform: translateY(-2px);
            }

            @media (max-width: 720px) {
                main {
                    width: auto;
                }

                ul {
                    gap: 0.5em;
                }

                ul li {
                    width: 100%;
                    text-align: center;
                }

                ul li:first-child {
                    margin-bottom: 0;
                }

                ul li:first-child .title {
                    font-size: 1.563em;
                }

                ul li img {
                    height: 260px;
                }
            }
        </style>
    </head>
    <body>
        <Header />
        <main>
            <section>
                <ul>
                    {
                        posts.map((post, index) => {
                            const heroImage = heroImages[index % heroImages.length];

                            return (
                                <li>
                                    <a href={`/blog/${post.id}/`}>
                                        <Image
                                            width={1200}
                                            height={675}
                                            src={heroImage}
                                            alt={`Cozy home and plant scene for ${post.data.title}`}
                                        />
                                        <h4 class="title">{post.data.title}</h4>
                                        <p class="date">
                                            <FormattedDate date={post.data.pubDate} />
                                        </p>
                                    </a>
                                </li>
                            );
                        })
                    }
                </ul>
            </section>
        </main>
        <Footer />
    </body>
</html>
'@

Set-Content -Path $blogPage -Value $astro -Encoding UTF8

Write-Host ""
Write-Host "DONE." -ForegroundColor Green
Write-Host "5 cozy images were added to src\assets."
Write-Host "src\pages\blog\index.astro now rotates them automatically."
Write-Host ""
Write-Host "Now run:"
Write-Host "npm run build"
Write-Host ""
Write-Host "Then check:"
Write-Host "http://localhost:4321/blog"
