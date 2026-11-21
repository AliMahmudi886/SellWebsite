import products from "./catalog.js";
const q = id => document.getElementById(id);
const money = amount => new Intl.NumberFormat("fa-IR").format(amount) + " تومان";
const number = new Intl.NumberFormat("fa-IR");
const text = (tag, value, className) => {
  const node = document.createElement(tag);
  node.textContent = value;
  if (className) node.className = className;
  return node;
};
const button = (label, action, style = "button") => {
  const node = text("button", label, style);
  node.type = "button";
  node.addEventListener("click", action);
  return node;
};
const image = product => {
  const node = document.createElement("img");
  node.src = "./assets/catalog/" + product.id + ".webp";
  node.alt = product.name;
  node.width = node.height = 640;
  node.loading = "lazy";
  return node;
};
const cart = new Map();
let confirmed = false;
function updateCart() {
  q("count").textContent = number.format([...cart.values()].reduce((a,b) => a+b,0));
}
function add(product) {
  const count = cart.get(product.id) ?? 0;
  if (count >= product.stock) {
    q("status").textContent = "تعداد بیشتر از موجودی نمونه است.";
    return;
  }
  cart.set(product.id,count+1);
  confirmed = false;
  updateCart();
  q("status").textContent = product.name + " به سبد اضافه شد.";
}
const normalize = value => value.normalize("NFKC").replace(/[يى]/g,"ی").replace(/ك/g,"ک").trim().toLowerCase();
for (const category of [...new Set(products.map(p => p.category))]) {
  const option = text("option",category);
  option.value = category;
  q("category").append(option);
}
function renderProducts() {
  const query = normalize(q("search").value);
  const category = q("category").value;
  const selected = products.filter(p => (!category || p.category === category) && normalize(p.name + " " + p.category).includes(query));
  q("empty").hidden = selected.length > 0;
  q("products").replaceChildren(...selected.map(product => {
    const card = document.createElement("article");
    card.className = "card";
    const copy = document.createElement("div");
    copy.className = "card-copy";
    const title = text("h3","");
    const link = text("a",product.name);
    link.href = "?product=" + encodeURIComponent(product.id);
    link.addEventListener("click", event => {
      if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      history.pushState({}, "", link.href);
      openDetail(product);
    });
    title.append(link);
    copy.append(title,text("p",product.category),text("p",money(product.price),"price"),button("افزودن به سبد",() => add(product)));
    card.append(image(product),copy);
    return card;
  }));
}
function openDetail(product) {
  const photo = image(product);
  photo.className = "detail-img";
  const heading = text("h2",product.name);
  heading.id = "detail-title";
  q("detail-content").replaceChildren(heading,photo,text("p",product.description),text("p",money(product.price),"price"),button("افزودن به سبد",() => add(product)));
  if (!q("detail").open) q("detail").showModal();
}
function showRoute() {
  const product = products.find(p => p.id === new URL(location.href).searchParams.get("product"));
  if (product) openDetail(product);
  else if (q("detail").open) q("detail").close();
}
q("detail").addEventListener("close", () => {
  const url = new URL(location.href);
  if (url.searchParams.has("product")) {
    url.searchParams.delete("product");
    history.replaceState({}, "", url);
  }
});
window.addEventListener("popstate",showRoute);
function renderCart() {
  const content = q("cart-content");
  content.replaceChildren();
  if (confirmed) {
    content.append(text("h3","سفارش آزمایشی ثبت شد"),text("p","این فقط پیش‌نمایش فرایند خرید است. پرداخت، ارسال و ثبت واقعی انجام نمی‌شود."));
    return;
  }
  if (!cart.size) {
    content.append(text("p","سبد خرید خالی است."));
    return;
  }
  let total = 0;
  for (const [id,quantity] of cart) {
    const product = products.find(p => p.id === id);
    total += product.price * quantity;
    const line = text("div","","line");
    line.append(text("span",product.name + " × " + number.format(quantity)),button("کم کردن",() => {
      if (quantity === 1) cart.delete(id);
      else cart.set(id,quantity-1);
      updateCart();
      renderCart();
    },"secondary"));
    content.append(line);
  }
  content.append(text("p","جمع: " + money(total),"price"),button("ثبت سفارش آزمایشی",() => {
    cart.clear();
    confirmed = true;
    updateCart();
    renderCart();
    q("status").textContent = "سفارش آزمایشی ثبت شد.";
  }));
}
q("open-cart").addEventListener("click",() => {
  renderCart();
  q("cart").showModal();
});
q("search").addEventListener("input", renderProducts);
q("category").addEventListener("change", renderProducts);
renderProducts();
showRoute();
