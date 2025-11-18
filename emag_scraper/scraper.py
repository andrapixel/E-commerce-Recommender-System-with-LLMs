import requests
from bs4 import BeautifulSoup
from urllib.parse import urlparse
import json

categories = [
    "laptopuri/c",
    "telefoane-mobile/c",
    "tablete/c",
    "smartwatch/c",
    "monitoare-lcd-led/c",
    "desktop-pc/c",
    "televizoare/c",
    "casti-bluetooth-telefoane/c",
    "aparate-foto-compacte/c",
    "jocuri-consola-pc/c",
    "console-hardware/c",
    "espressoare/c",
    "friteuze/c",
    "blendere----tocatoare/c",
    "masini-spalat-rufe/c",
    "frigidere/c",
    "epilatoare/c",
    "perii-par-electrice/c",
    "periute-dinti-electrice/c",
    "aparate-tuns/c",
    "genti-laptop/c",
    "incarcatoare-telefoane/c",
    "roboti-bucatarie/c",
    "mouse/c",
    "tastaturi/c",
    "cuptoare-microunde/c",
    "aragazuri/c",
    "aspiratoare/c",
    "boxe-portabile/c"
]

class Product:
    def __init__(self, name, category, price, rating, image_url, product_url):
        self.name = name
        self.category = category
        self.price = price
        self.rating = rating
        self.image_url = image_url
        self.product_url = product_url
        
    def __str__(self):
        return (
            f"Product: {self.name}\n"
            f"Category: {self.category}\n"
            f"Price: {self.price}\n"
            f"Rating: {self.rating}\n"
            f"Image: {self.image_url}\n"
            f"URL: {self.product_url}"
        )

class EmagScraper:
    def __init__(self, base_url, max_products=500, max_per_category=10):
        self.base_url = base_url
        self.products = []
        self.max_products = max_products       # global limit
        self.max_per_category = max_per_category
        self.category_counts = {}  
        self.seen_urls = set()

    def scrape_products(self, url):
        # stop early if we already have enough products globally
        if len(self.products) >= self.max_products:
            return

        try:
            headers = {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) '
                              'AppleWebKit/537.36 (KHTML, like Gecko) '
                              'Chrome/91.0.4472.124 Safari/537.36'
            }

            response = requests.get(url, headers=headers, timeout=10)
            response.raise_for_status()

            soup = BeautifulSoup(response.content, "html.parser")

            product_containers = soup.find_all("div", class_="card-standard")

            # derive category slug from URL (e.g. "/laptopuri/c" -> "laptopuri")
            parsed = urlparse(url)
            path = parsed.path
            category_slug = path.strip("/").split("/")[0] or "other"

            # how many we already collected for THIS category
            current_count = self.category_counts.get(category_slug, 0)

            for product_container in product_containers:
                # check global limit again inside the loop
                if len(self.products) >= self.max_products:
                    break

                # stop if we already have enough from this category
                if current_count >= self.max_per_category:
                    break

                try:
                    product_name = product_container.get("data-name")

                    product_price = product_container.find("p", class_="product-new-price").text.strip()
                    product_price = product_price.strip('Lei').strip()

                    try:
                        product_rating = product_container.find("span", class_="average-rating").text.strip()
                    except AttributeError:
                        product_rating = "0"

                    try:
                        product_image = product_container.find("img").get('src')
                    except AttributeError:
                        product_image = ''

                    try:
                        product_url = product_container.find("a", class_='js-product-url').get('href')
                    except AttributeError:
                        product_url = ''

                    if not product_url or product_url in self.seen_urls:
                        continue
                    self.seen_urls.add(product_url)

                    product_instance = Product(
                        name=product_name,
                        category=category_slug,
                        price=product_price,
                        rating=product_rating,
                        image_url=product_image,
                        product_url=product_url
                    )
                    self.products.append(product_instance)

                    current_count += 1
                    self.category_counts[category_slug] = current_count

                except AttributeError:
                    print("Error parsing product information.")

            # if we hit either global or per-category limit, don't go to the next page
            if len(self.products) >= self.max_products or current_count >= self.max_per_category:
                return

        except requests.RequestException as e:
            print(f"Failed to retrieve the webpage. Error: {e}")

    def scrape_all_categories(self, categories):
        for category in categories:
            if len(self.products) >= self.max_products:
                break

            category_url = f"{self.base_url}/{category}"
            print(f"Scraping category: {category_url}")
            self.scrape_products(url=category_url)

    def save_to_json(self, filepath):
        data = []
        for i, p in enumerate(self.products, start=1):
            # simple tags from name words
            name_lower = (p.name or "").lower()
            tags = [w for w in name_lower.replace(",", " ").split() if len(w) > 2]

            # normalize price 
            price_str = (p.price or "").replace(".", "").replace(",", ".")
            try:
                price_value = float(price_str)
            except ValueError:
                price_value = None

            try:
                rating_value = float(p.rating)
            except ValueError:
                rating_value = 0.0

            data.append({
                "id": f"p{i}",
                "name": p.name,
                "category": p.category,
                "tags": tags,
                "price": price_value,
                "rating": rating_value,
                "imageUrl": p.image_url,
                "productUrl": p.product_url
            })

        with open(filepath, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)

        print(f"Saved {len(data)} products to {filepath}")

if __name__ == "__main__":
    base_url = "https://www.emag.ro"

    scraper = EmagScraper(base_url=base_url, max_products=500, max_per_category=10)

    scraper.scrape_all_categories(categories)
    print(f"Total products scraped: {len(scraper.products)}")
    scraper.save_to_json("emag_products.json")
